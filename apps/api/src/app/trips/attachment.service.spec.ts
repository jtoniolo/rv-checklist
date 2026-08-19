import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Rig, Trip } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
  InMemoryChecklistRepository,
  InMemoryRigRepository,
  InMemoryStopRepository,
  InMemoryTripRepository,
} from '@rv-checklist/domain/testing';
import { InMemoryObjectStorage } from '../storage/in-memory-object-storage.js';
import { AttachmentService } from './attachment.service.js';
import { StopService } from './stop.service.js';
import { TripService } from './trip.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const aliceTripId = '550e8400-e29b-41d4-a716-446655440030';
const bobTripId = '550e8400-e29b-41d4-a716-446655440031';
const missingId = '550e8400-e29b-41d4-a716-446655440099';

const aliceRig: Rig = { id: aliceRigId, ownerId: alice, nickname: 'Silver' };
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: "Bob's" };
const aliceTrip: Trip = {
  id: aliceTripId,
  rigId: aliceRigId,
  name: 'Fall colours loop',
  checklistIds: [],
};
const bobTrip: Trip = {
  id: bobTripId,
  rigId: bobRigId,
  name: "Bob's trip",
  checklistIds: [],
};

const png = (filename = 'site-map.png') => ({
  filename,
  mimeType: 'image/png',
  content: Buffer.from('png bytes'),
});

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function makeServices() {
  const rigs = new InMemoryRigRepository();
  const trips = new InMemoryTripRepository();
  const stops = new InMemoryStopRepository();
  const attachments = new InMemoryAttachmentRepository();
  const checklists = new InMemoryChecklistRepository();
  const storage = new InMemoryObjectStorage();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await trips.save(aliceTrip);
  await trips.save(bobTrip);
  const stopService = new StopService(stops, trips, rigs, attachments, storage);
  const service = new AttachmentService(
    attachments,
    stops,
    trips,
    rigs,
    storage,
  );
  const tripService = new TripService(
    trips,
    stops,
    checklists,
    rigs,
    attachments,
    storage,
  );
  const aliceStop = await stopService.create(alice, { tripId: aliceTripId });
  const bobStop = await stopService.create(bob, { tripId: bobTripId });
  return {
    service,
    stopService,
    tripService,
    storage,
    attachments,
    aliceStopId: aliceStop.id,
    bobStopId: bobStop.id,
  };
}

describe('AttachmentService', () => {
  describe('upload', () => {
    it('stores the bytes under stops/<stopId>/<attachmentId> and the metadata row', async () => {
      const { service, storage, aliceStopId } = await makeServices();

      const attachment = await service.upload(alice, aliceStopId, png());

      expect(attachment).toMatchObject({
        stopId: aliceStopId,
        filename: 'site-map.png',
        mimeType: 'image/png',
        sizeBytes: 9,
        isCampgroundMap: false,
      });
      expect(storage.keys()).toEqual([`stops/${aliceStopId}/${attachment.id}`]);
    });

    it('rejects a type outside the accepted set (ADR-0026)', async () => {
      const { service, storage, aliceStopId } = await makeServices();

      await expect(
        service.upload(alice, aliceStopId, {
          filename: 'diagram.svg',
          mimeType: 'image/svg+xml',
          content: Buffer.from('<svg/>'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.keys()).toEqual([]);
    });

    it('rejects a file over the 15 MB cap', async () => {
      const { service, storage, aliceStopId } = await makeServices();

      await expect(
        service.upload(alice, aliceStopId, {
          filename: 'huge.png',
          mimeType: 'image/png',
          content: Buffer.alloc(15 * 1024 * 1024 + 1),
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(storage.keys()).toEqual([]);
    });

    it('rejects a blank filename', async () => {
      const { service, aliceStopId } = await makeServices();

      await expect(
        service.upload(alice, aliceStopId, {
          filename: '',
          mimeType: 'image/png',
          content: Buffer.from('bytes'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty file', async () => {
      const { service, aliceStopId } = await makeServices();

      await expect(
        service.upload(alice, aliceStopId, {
          filename: 'empty.png',
          mimeType: 'image/png',
          content: Buffer.alloc(0),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses another owner's stop and a missing stop alike (house 404)", async () => {
      const { service, bobStopId } = await makeServices();

      await expect(
        service.upload(alice, bobStopId, png()),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.upload(alice, missingId, png()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('download', () => {
    it('streams the original bytes with the stored attachment metadata', async () => {
      const { service, aliceStopId } = await makeServices();
      const uploaded = await service.upload(alice, aliceStopId, png());

      const { attachment, body } = await service.download(alice, uploaded.id);

      expect(attachment).toEqual(uploaded);
      const bytes = await drain(body);
      expect(bytes.toString()).toBe('png bytes');
    });

    it("refuses another owner's attachment (house 404)", async () => {
      const { service, bobStopId } = await makeServices();
      const bobs = await service.upload(bob, bobStopId, png());

      await expect(service.download(alice, bobs.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('campground-map flag (at most one per stop)', () => {
    it('flagging an attachment swaps the flag off any other on the stop', async () => {
      const { service, attachments, aliceStopId } = await makeServices();
      const first = await service.upload(alice, aliceStopId, png('a.png'));
      const second = await service.upload(alice, aliceStopId, png('b.png'));

      await service.setCampgroundMap(alice, first.id, true);
      const swapped = await service.setCampgroundMap(alice, second.id, true);

      expect(swapped.isCampgroundMap).toBe(true);
      const all = await attachments.listByStop(aliceStopId);
      expect(all.filter((a) => a.isCampgroundMap).map((a) => a.id)).toEqual([
        second.id,
      ]);
    });

    it('unflagging leaves the stop with no campground map', async () => {
      const { service, attachments, aliceStopId } = await makeServices();
      const uploaded = await service.upload(alice, aliceStopId, png());
      await service.setCampgroundMap(alice, uploaded.id, true);

      const unflagged = await service.setCampgroundMap(
        alice,
        uploaded.id,
        false,
      );

      expect(unflagged.isCampgroundMap).toBe(false);
      const all = await attachments.listByStop(aliceStopId);
      expect(all.some((a) => a.isCampgroundMap)).toBe(false);
    });

    it('does not touch a sibling stop’s map', async () => {
      const { service, stopService, attachments, aliceStopId } =
        await makeServices();
      const sibling = await stopService.create(alice, { tripId: aliceTripId });
      const siblingMap = await service.upload(alice, sibling.id, png());
      await service.setCampgroundMap(alice, siblingMap.id, true);
      const mine = await service.upload(alice, aliceStopId, png());

      await service.setCampgroundMap(alice, mine.id, true);

      const siblingAll = await attachments.listByStop(sibling.id);
      expect(siblingAll[0]?.isCampgroundMap).toBe(true);
    });

    it("refuses another owner's attachment (house 404)", async () => {
      const { service, bobStopId } = await makeServices();
      const bobs = await service.upload(bob, bobStopId, png());

      await expect(
        service.setCampgroundMap(alice, bobs.id, true),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('stop reads embed attachment metadata (ADR-0026)', () => {
    it('stop operations come back with the attachments array', async () => {
      const { service, stopService, aliceStopId } = await makeServices();
      const uploaded = await service.upload(alice, aliceStopId, png());

      const stop = await stopService.update(alice, aliceStopId, {
        campground: 'Algonquin',
      });

      expect(stop.attachments).toEqual([uploaded]);
    });

    it('trip reads embed each stop’s attachments', async () => {
      const { service, tripService, aliceStopId } = await makeServices();
      const uploaded = await service.upload(alice, aliceStopId, png());

      const trip = await tripService.get(alice, aliceTripId);

      expect(trip.stops[0]?.attachments).toEqual([uploaded]);
    });
  });

  describe('cascaded hard deletion — no orphan objects (ADR-0026)', () => {
    it('attachment delete removes its row and its object, nothing else', async () => {
      const { service, storage, attachments, aliceStopId } =
        await makeServices();
      const keep = await service.upload(alice, aliceStopId, png('keep.png'));
      const gone = await service.upload(alice, aliceStopId, png('gone.png'));

      await service.remove(alice, gone.id);

      expect(storage.keys()).toEqual([`stops/${aliceStopId}/${keep.id}`]);
      expect(await attachments.findById(gone.id)).toBeUndefined();
    });

    it("attachment delete refuses another owner's attachment (house 404)", async () => {
      const { service, storage, bobStopId } = await makeServices();
      const bobs = await service.upload(bob, bobStopId, png());

      await expect(service.remove(alice, bobs.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.keys()).toEqual([`stops/${bobStopId}/${bobs.id}`]);
    });

    it('stop delete removes everything under the stop’s prefix', async () => {
      const { service, stopService, storage, aliceStopId, bobStopId } =
        await makeServices();
      await service.upload(alice, aliceStopId, png('a.png'));
      await service.upload(alice, aliceStopId, png('b.png'));
      const bobs = await service.upload(bob, bobStopId, png());

      await stopService.remove(alice, aliceStopId);

      expect(storage.keys()).toEqual([`stops/${bobStopId}/${bobs.id}`]);
    });

    it('trip delete cascades through its stops’ prefixes', async () => {
      const { service, stopService, tripService, storage, aliceStopId } =
        await makeServices();
      const second = await stopService.create(alice, { tripId: aliceTripId });
      await service.upload(alice, aliceStopId, png('a.png'));
      await service.upload(alice, second.id, png('b.png'));

      await tripService.remove(alice, aliceTripId);

      expect(storage.keys()).toEqual([]);
    });
  });
});
