import { z } from 'zod';
import { UploadAttachmentSchema } from './attachment.js';
import {
  CreateChecklistSchema,
  CreateChecklistWithIdSchema,
} from './checklist.js';
import {
  CreateEquipmentItemSchema,
  CreateEquipmentItemWithIdSchema,
} from './equipment.js';
import {
  CreateLogEntrySchema,
  CreateLogEntryWithIdSchema,
} from './log-entry.js';
import {
  CreateMaintenanceTaskSchema,
  CreateMaintenanceTaskWithIdSchema,
} from './maintenance-task.js';
import { CreateRigSchema, CreateRigWithIdSchema } from './rig.js';
import { CreateRunSchema, CreateRunWithIdSchema } from './run.js';
import {
  CreateStopSchema,
  CreateStopWithIdSchema,
  CreateTripSchema,
  CreateTripWithIdSchema,
} from './trip.js';

const uuid = '550e8400-e29b-41d4-a716-446655440077';
const rigId = '550e8400-e29b-41d4-a716-446655440010';

/**
 * The nine create bodies, each paired with the HTTP-only variant that accepts
 * a client-generated id (ADR-0028, issue #143), and a body valid under both.
 */
const pairs = [
  [
    'rig',
    CreateRigSchema,
    CreateRigWithIdSchema,
    { nickname: 'Silver Bullet' },
  ],
  [
    'equipment item',
    CreateEquipmentItemSchema,
    CreateEquipmentItemWithIdSchema,
    { rigId, name: 'Surge protector' },
  ],
  [
    'checklist',
    CreateChecklistSchema,
    CreateChecklistWithIdSchema,
    { rigId, name: 'Pre-departure' },
  ],
  [
    'run',
    CreateRunSchema,
    CreateRunWithIdSchema,
    { checklistId: '550e8400-e29b-41d4-a716-446655440020' },
  ],
  [
    'maintenance task',
    CreateMaintenanceTaskSchema,
    CreateMaintenanceTaskWithIdSchema,
    { rigId, name: 'Grease the bearings' },
  ],
  [
    'log entry',
    CreateLogEntrySchema,
    CreateLogEntryWithIdSchema,
    {
      taskId: '550e8400-e29b-41d4-a716-446655440030',
      performedOn: '2026-08-01',
      fields: [],
    },
  ],
  [
    'trip',
    CreateTripSchema,
    CreateTripWithIdSchema,
    { rigId, name: 'Fall colours loop' },
  ],
  [
    'stop',
    CreateStopSchema,
    CreateStopWithIdSchema,
    { tripId: '550e8400-e29b-41d4-a716-446655440040' },
  ],
] as const satisfies readonly (readonly [
  string,
  z.ZodType,
  z.ZodType,
  Record<string, unknown>,
])[];

describe('client-generated ids on the create bodies (issue #143)', () => {
  describe.each(pairs)('%s', (_name, plain, withId, body) => {
    it('accepts a well-formed client id on the HTTP variant', () => {
      const parsed = withId.parse({ ...body, id: uuid });

      expect(parsed).toMatchObject({ id: uuid });
    });

    it('rejects a malformed client id — the 400 the endpoint returns', () => {
      expect(withId.safeParse({ ...body, id: 'not-a-uuid' }).success).toBe(
        false,
      );
    });

    it('stays valid with no id at all — the server mints one', () => {
      const parsed = withId.parse(body);

      expect(parsed).not.toHaveProperty('id');
    });

    /**
     * The pinned MCP contract: the tools bind these shared create schemas
     * straight through as their tool parameters, so extending them would have
     * published `id` as an MCP tool argument. The variant exists precisely so
     * they did not have to change.
     */
    it('leaves the MCP-bound schema without an id of its own', () => {
      expect(plain.parse({ ...body, id: uuid })).not.toHaveProperty('id');
    });
  });
});

describe('CreateTripWithIdSchema stops', () => {
  const trip = { rigId, name: 'Fall colours loop' };

  it('accepts a client id on each initial stop', () => {
    const parsed = CreateTripWithIdSchema.parse({
      ...trip,
      stops: [{ id: uuid, campground: 'Pine Hollow' }],
    });

    expect(parsed.stops).toEqual([{ id: uuid, campground: 'Pine Hollow' }]);
  });

  it('rejects a malformed stop id', () => {
    expect(
      CreateTripWithIdSchema.safeParse({
        ...trip,
        stops: [{ id: 'not-a-uuid' }],
      }).success,
    ).toBe(false);
  });

  it('leaves the MCP-bound trip schema’s stops without ids', () => {
    const parsed = CreateTripSchema.parse({
      ...trip,
      stops: [{ id: uuid, campground: 'Pine Hollow' }],
    });

    expect(parsed.stops[0]).not.toHaveProperty('id');
  });
});

describe('UploadAttachmentSchema', () => {
  it('accepts an empty body — a plain upload, exactly as before', () => {
    expect(UploadAttachmentSchema.parse({})).toEqual({});
  });

  it('coerces the multipart text flag', () => {
    expect(UploadAttachmentSchema.parse({ isCampgroundMap: 'true' })).toEqual({
      isCampgroundMap: true,
    });
    expect(UploadAttachmentSchema.parse({ isCampgroundMap: 'false' })).toEqual({
      isCampgroundMap: false,
    });
  });

  it('rejects a malformed id and a non-boolean flag', () => {
    expect(UploadAttachmentSchema.safeParse({ id: 'nope' }).success).toBe(
      false,
    );
    expect(
      UploadAttachmentSchema.safeParse({ isCampgroundMap: 'maybe' }).success,
    ).toBe(false);
  });
});
