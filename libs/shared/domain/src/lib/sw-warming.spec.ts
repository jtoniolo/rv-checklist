import type { Attachment } from './attachment.js';
import { orderAttachmentsForWarming } from './sw-warming.js';

const stopId = '550e8400-e29b-41d4-a716-446655440001';

function attachment(
  id: string,
  isCampgroundMap: boolean,
  filename = `${id}.png`,
): Attachment {
  return {
    id,
    stopId,
    filename,
    mimeType: 'image/png',
    sizeBytes: 1024,
    isCampgroundMap,
  };
}

describe('orderAttachmentsForWarming', () => {
  it('puts campground maps first, offline is only useful once the map is there', () => {
    const receipt = attachment('a', false);
    const map = attachment('b', true);
    const packingList = attachment('c', false);

    expect(
      orderAttachmentsForWarming([receipt, map, packingList]).map((a) => a.id),
    ).toEqual(['b', 'a', 'c']);
  });

  it('keeps the given order within each group (stable sort)', () => {
    const mapOne = attachment('map-1', true);
    const mapTwo = attachment('map-2', true);
    const fileOne = attachment('file-1', false);
    const fileTwo = attachment('file-2', false);

    expect(
      orderAttachmentsForWarming([fileOne, mapOne, fileTwo, mapTwo]).map(
        (a) => a.id,
      ),
    ).toEqual(['map-1', 'map-2', 'file-1', 'file-2']);
  });

  it('is a no-op on an empty trip', () => {
    expect(orderAttachmentsForWarming([])).toEqual([]);
  });
});
