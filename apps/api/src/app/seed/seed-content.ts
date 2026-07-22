import type { FieldSchema } from '@rv-checklist/domain';

/**
 * The starter content for a new owner, transcribed from `docs/seed-content.md`
 * (issue #19) — the doc is the source of truth; this constant is its typed
 * form. A towable travel trailer's worth of content: 16 maintenance tasks and
 * 9 checklists (4 packing + 5 procedures), with the procedures' ⚙︎ steps
 * referencing tasks **by name** (ids don't exist until seeding creates the
 * tasks) and ✎ steps carrying their own field schemas (ADR-0008).
 */

export interface SeedTask {
  readonly name: string;
  /** Why the task matters plus a short how — verbatim from the doc (issue #26). */
  readonly description: string;
  readonly intervalMonths: number;
  readonly fieldSchema: FieldSchema;
}

export interface SeedStep {
  readonly text: string;
  /** The seed task this step performs (⚙︎ in the doc), referenced by name. */
  readonly task?: string;
  /** A plain step's own custom fields (✎ in the doc). */
  readonly fieldSchema?: FieldSchema;
}

export interface SeedChecklist {
  readonly name: string;
  readonly tags: readonly string[];
  readonly steps: readonly SeedStep[];
}

export const SEED_RIG_NICKNAME = 'My Travel Trailer';

// Task names, as constants so a ⚙︎ reference can't drift from its task.
const WHEEL_BEARINGS = 'Repack / inspect wheel bearings';
const BRAKES = 'Inspect & adjust brakes';
const TIRES = 'Inspect tires — pressure, tread, age';
const ROOF = 'Inspect & reseal roof';
const SEAMS = 'Inspect exterior seams & seals';
const SLIDE_SEALS = 'Condition slide-out seals';
const LUBRICATE = 'Lubricate slides / jacks / stabilizers';
const SANITIZE = 'Sanitize fresh water system';
const WINTERIZE = 'Winterize water system';
const DEWINTERIZE = 'De-winterize water system';
const WATER_HEATER = 'Flush water heater / check anode rod';
const PROPANE = 'Propane system leak test & regulator check';
const ALARMS = 'Test smoke / CO / propane alarms';
const EXTINGUISHER = 'Inspect fire extinguisher';
const BATTERY = 'Battery service — charge & terminals';
const HITCH = 'Repack / grease hitch & coupler';

export const SEED_TASKS: readonly SeedTask[] = [
  {
    name: WHEEL_BEARINGS,
    description:
      'Worn or dry wheel bearings can seize or fail at speed, risking a wheel coming off the trailer. How: 1) Raise and support the axle so the wheel spins free; 2) Pull the hub and check the bearings and races for pitting, discoloration, or roughness; 3) Clean and repack (or replace) the bearings with fresh grease; 4) Reassemble, set the bearing preload, and confirm the wheel spins smoothly with no play.',
    intervalMonths: 12,
    fieldSchema: [
      { name: 'grease type', type: 'text', required: false },
      { name: 'odometer', type: 'number', required: false, unit: 'mi' },
    ],
  },
  {
    name: BRAKES,
    description:
      'Trailer brakes that are worn or out of adjustment lengthen stopping distance and overwork the tow vehicle. How: 1) Raise and support each braked wheel; 2) Inspect the linings and drums or rotors for wear and scoring; 3) Adjust the brakes to the correct running clearance; 4) Test operation and confirm even braking across all wheels.',
    intervalMonths: 12,
    fieldSchema: [{ name: 'measured pad/shoe', type: 'text', required: false }],
  },
  {
    name: TIRES,
    description:
      "Underinflated, worn, or aged tires are a leading cause of blowouts, and RV tires often age out before the tread wears down. How: 1) Check and set cold inflation pressure on every tire, including the spare; 2) Measure tread depth and look for uneven wear; 3) Inspect the sidewalls for cracks, bulges, or damage; 4) Read the date code and weigh the tire's age against its service life.",
    intervalMonths: 12,
    fieldSchema: [
      { name: 'tread depth', type: 'number', required: false, unit: '/32"' },
      { name: 'DOT date', type: 'text', required: false },
      { name: 'set pressure', type: 'number', required: false, unit: 'psi' },
    ],
  },
  {
    name: ROOF,
    description:
      'A roof left unsealed lets water in, and hidden leaks cause expensive structural and interior damage. How: 1) Clean the roof so the seams and sealant are visible; 2) Inspect all seams, edges, and openings for cracked, lifting, or missing sealant; 3) Remove failed sealant where needed; 4) Apply fresh sealant compatible with the roof material and let it cure.',
    intervalMonths: 12,
    fieldSchema: [{ name: 'sealant product', type: 'text', required: false }],
  },
  {
    name: SEAMS,
    description:
      'Exterior seams and seals are the main defense against water intrusion, and gaps here lead to rot and mold. How: 1) Walk the exterior and inspect every seam, window, door, and penetration; 2) Look for cracked, shrunken, or peeling sealant; 3) Clean out any failed material; 4) Re-seal with an appropriate sealant and confirm a continuous bead.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: SLIDE_SEALS,
    description:
      'Dry, cracked slide-out seals let in water and drafts and can tear as the slide moves. How: 1) Clean the seals with a mild cleaner and let them dry; 2) Inspect for cracks, tears, or flat spots; 3) Apply a rubber-safe conditioner along the seals; 4) Cycle the slide in and out to work the conditioner in.',
    intervalMonths: 12,
    fieldSchema: [{ name: 'product', type: 'text', required: false }],
  },
  {
    name: LUBRICATE,
    description:
      'Moving mechanisms bind, wear, and can fail if run dry, making setup harder and travel less safe. How: 1) Clean dirt and old grease from the slide rails, jack screws, and stabilizer mechanisms; 2) Inspect for damage or excessive wear; 3) Apply the appropriate lubricant to each moving part; 4) Cycle each mechanism through its range to distribute the lubricant.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: SANITIZE,
    description:
      'The fresh water system can harbor bacteria and biofilm, especially after storage, making the water unsafe to drink. How: 1) Drain the fresh water tank and lines; 2) Add a sanitizing solution to the tank and fill with water; 3) Run it through every faucet until you smell it, then let it sit; 4) Drain fully and flush with clean water until the smell is gone.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: WINTERIZE,
    description:
      'Water left in the system freezes and expands, cracking pipes, fittings, and the water heater. How: 1) Drain the fresh, gray, and black tanks and the water heater; 2) Bypass the water heater and blow out or drain the lines; 3) Pump RV antifreeze through every faucet and fixture until it runs pink; 4) Add antifreeze to all drain traps and the toilet.',
    intervalMonths: 12,
    fieldSchema: [
      { name: 'antifreeze gallons used', type: 'number', required: false },
    ],
  },
  {
    name: DEWINTERIZE,
    description:
      'Antifreeze left in the system tastes bad and should be cleared, and the system should be checked before use. How: 1) Drain any antifreeze from the tanks and lines; 2) Remove the water-heater bypass and reconnect it normally; 3) Flush the system with fresh water until the antifreeze is gone; 4) Sanitize the fresh water system before drinking.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: WATER_HEATER,
    description:
      'Sediment builds up in the water heater and cuts efficiency, and a spent anode rod lets the tank corrode. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank and remove the drain plug or anode rod; 3) Flush out the sediment until the water runs clear; 4) Inspect the anode rod, replace it if heavily consumed, then reinstall and refill.',
    intervalMonths: 12,
    fieldSchema: [
      { name: 'anode remaining', type: 'number', required: false, unit: '%' },
    ],
  },
  {
    name: PROPANE,
    description:
      'A propane leak or a failing regulator is a fire and explosion hazard and can make appliances run unsafely. How: 1) With the system charged and appliances off, watch for a pressure drop or apply a leak-detection solution to the connections; 2) Check fittings and hoses for damage or cracking; 3) Verify the regulator delivers correct, steady pressure; 4) Fix any leak before use and confirm the system holds.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: ALARMS,
    description:
      'Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested and dated. How: 1) Press the test button on each alarm to confirm it sounds; 2) Check the manufacture or expiration date and replace expired units; 3) Replace batteries where applicable; 4) Confirm each detector is securely mounted and unobstructed.',
    intervalMonths: 12,
    fieldSchema: [],
  },
  {
    name: EXTINGUISHER,
    description:
      'An extinguisher that is discharged, expired, or blocked is useless in an emergency. How: 1) Confirm the extinguisher is present and easy to reach; 2) Check that the pressure gauge reads in the operating range; 3) Inspect for damage, corrosion, or a broken seal or pin; 4) Verify it is within its service life and recharge or replace it as needed.',
    intervalMonths: 12,
    fieldSchema: [{ name: 'gauge OK', type: 'text', required: false }],
  },
  {
    name: BATTERY,
    description:
      'A neglected battery loses capacity, and corroded terminals cause hard starts, poor charging, and failures. How: 1) Check the state of charge and charge it fully; 2) Clean any corrosion from the terminals and connections; 3) Inspect the case for damage and, if serviceable, check the fluid levels; 4) Confirm tight connections and a healthy resting voltage.',
    intervalMonths: 12,
    fieldSchema: [
      { name: 'resting voltage', type: 'number', required: false, unit: 'V' },
    ],
  },
  {
    name: HITCH,
    description:
      'A dry or worn hitch and coupler can bind, wear rapidly, or fail to hold, risking loss of the trailer in tow. How: 1) Clean old grease and dirt from the coupler, ball, and moving hitch parts; 2) Inspect for wear, cracks, or deformation; 3) Apply fresh grease to the ball, coupler, and pivot points; 4) Check that the latch engages and locks securely.',
    intervalMonths: 12,
    fieldSchema: [],
  },
];

export const SEED_CHECKLISTS: readonly SeedChecklist[] = [
  {
    name: 'Season load-in',
    tags: ['packing', 'season-start'],
    steps: [
      { text: 'Camp chairs' },
      { text: 'Outdoor mat / rug' },
      { text: 'Leveling blocks & wheel chocks' },
      {
        text: 'Hitch gear (weight-distribution bars, sway control, pin, lock)',
      },
      { text: 'Sewer hose kit' },
      { text: 'Fresh-water (potable) hose' },
      { text: 'Water pressure regulator' },
      { text: 'Surge protector / EMS' },
      { text: '30/50A adapters' },
      { text: 'Extension cords' },
      { text: 'Toolbox & duct tape' },
      { text: 'Tire-change kit (jack, blocks, lug wrench, gloves)' },
      { text: 'First-aid kit' },
      { text: 'Fire extinguisher (verify present & charged)' },
      { text: 'Flashlights / headlamps' },
      { text: 'Broom & dustpan' },
      { text: 'Bins for kitchen / bath basics' },
      { text: 'Spare fuses' },
      { text: 'Level / leveling app' },
    ],
  },
  {
    name: 'Trip packing — ahead',
    tags: ['packing', 'trip'],
    steps: [
      { text: 'Clothing by forecast' },
      { text: 'Bedding & pillows' },
      { text: 'Towels' },
      { text: 'Toiletries' },
      { text: 'Medications' },
      { text: 'Phone / device chargers' },
      { text: 'Camp kitchen (pots, utensils, coffee maker)' },
      { text: 'Dish soap & sponges' },
      { text: 'Trash bags' },
      { text: 'Lighter / matches' },
      { text: 'Bug spray & sunscreen' },
      { text: 'Outdoor games' },
      { text: 'Books / entertainment' },
      { text: 'Laundry bag' },
      { text: 'Reservation confirmations / permits' },
      { text: 'Cash for firewood' },
      {
        text: 'Fresh water level — top up before leaving',
        fieldSchema: [
          {
            name: 'Fresh water level',
            type: 'number',
            required: false,
            unit: '%',
          },
        ],
      },
    ],
  },
  {
    name: 'Trip packing — day-of',
    tags: ['packing', 'trip', 'day-of'],
    steps: [
      { text: 'Perishable food from home fridge' },
      { text: 'Ice' },
      { text: 'Leftovers / prepped meals' },
      { text: 'Daily meds' },
      { text: 'Phones & laptops off chargers' },
      { text: 'Kids’ / pet comfort items' },
      { text: 'Anything charging overnight' },
      { text: 'Glasses / sunglasses' },
      { text: 'Wallet & keys' },
      { text: 'Last-minute forecast recheck' },
    ],
  },
  {
    name: 'Food',
    tags: ['packing', 'food'],
    steps: [
      // Staples core.
      { text: 'Coffee & filters' },
      { text: 'Salt / pepper / oil' },
      { text: 'Spices' },
      { text: 'Condiments (ketchup, mustard, mayo)' },
      { text: 'Cooking spray' },
      { text: 'Sugar' },
      { text: 'Foil & storage bags' },
      { text: 'Paper towels' },
      { text: 'Napkins' },
      { text: 'Dish soap' },
      { text: 'S’mores kit' },
      { text: 'Water / drinks' },
      // Per-trip.
      { text: 'Breakfast items' },
      { text: 'Lunch items' },
      { text: 'Dinner ingredients' },
      { text: 'Snacks' },
      { text: 'Pet food' },
      { text: 'Pet treats' },
    ],
  },
  {
    name: 'Spring opening',
    tags: ['procedure', 'spring'],
    steps: [
      { text: 'Remove cover / pull from storage' },
      { text: 'Exterior wash' },
      { text: 'Inspect roof for winter damage', task: ROOF },
      { text: 'Inspect seams / seals', task: SEAMS },
      { text: 'Condition slide seals', task: SLIDE_SEALS },
      { text: 'De-winterize water system', task: DEWINTERIZE },
      { text: 'Sanitize fresh water', task: SANITIZE },
      { text: 'Check tires', task: TIRES },
      { text: 'Repack wheel bearings', task: WHEEL_BEARINGS },
      { text: 'Check brakes', task: BRAKES },
      { text: 'Battery back in & charge', task: BATTERY },
      { text: 'Test alarms', task: ALARMS },
      { text: 'Propane leak test', task: PROPANE },
      { text: 'Run fridge on all sources' },
      { text: 'Test A/C & furnace' },
      { text: 'Lubricate slides / jacks', task: LUBRICATE },
      { text: 'Restock consumables' },
    ],
  },
  {
    name: 'Pre-trip prep',
    tags: ['procedure', 'trip-prep'],
    steps: [
      { text: 'Confirm reservations' },
      { text: 'Check weather trend' },
      { text: 'Charge battery' },
      { text: 'Check tire pressure (all incl. spare)' },
      { text: 'Test fridge cools down' },
      { text: 'Fill propane' },
      { text: 'Inspect hitch & coupler' },
      { text: 'Test running / brake / turn lights' },
      { text: 'Flush & fill fresh water' },
      { text: 'Verify sewer / water hoses present' },
      { text: 'Restock first-aid & meds' },
      { text: 'Check fire extinguisher gauge' },
      { text: 'Note anything to fix / replace (the slack week)' },
    ],
  },
  {
    name: 'Departure',
    tags: ['procedure', 'departure'],
    steps: [
      { text: 'Retract / stow slides' },
      { text: 'Lower antenna & roof vents' },
      { text: 'Latch fridge & cabinets' },
      { text: 'Secure loose items' },
      { text: 'Close & lock windows' },
      { text: 'Turn off water pump' },
      { text: 'Turn off propane at tank' },
      { text: 'Retract stabilizers / jacks' },
      {
        text: 'Hitch up (coupler latched & locked, weight-distribution bars, sway control, safety chains, breakaway cable)',
      },
      { text: 'Connect & test lights (running / brake / turn)' },
      {
        text: 'Walk-around: chocks removed, steps in, hatches closed, tow mirrors set',
      },
      { text: 'Final tire-pressure glance' },
      { text: 'Do a full lap of the site' },
      {
        text: 'Fresh water on board',
        fieldSchema: [
          {
            name: 'Fresh water on board',
            type: 'number',
            required: false,
            unit: '%',
          },
        ],
      },
      {
        text: 'Gray / black tank levels',
        fieldSchema: [
          { name: 'Gray / black tank levels', type: 'text', required: false },
        ],
      },
      {
        text: 'Odometer',
        fieldSchema: [
          { name: 'Odometer', type: 'number', required: false, unit: 'mi' },
        ],
      },
    ],
  },
  {
    name: 'Campsite teardown',
    tags: ['procedure', 'teardown'],
    steps: [
      { text: 'Dump black then gray tanks' },
      { text: 'Rinse & stow sewer hose' },
      { text: 'Disconnect & stow water hose & regulator' },
      { text: 'Disconnect & stow power cord / adapters' },
      { text: 'Bring in outdoor mat, chairs, grill' },
      { text: 'Take down awning' },
      { text: 'Pack outdoor gear' },
      { text: 'Trash to bins' },
      { text: 'Quick interior stow' },
      { text: 'Then run Departure' },
    ],
  },
  {
    name: 'Fall closing / winterization',
    tags: ['procedure', 'fall', 'winterize'],
    steps: [
      { text: 'Drain fresh / gray / black tanks' },
      { text: 'Flush water heater & check anode', task: WATER_HEATER },
      { text: 'Bypass water heater' },
      { text: 'Blow out water lines' },
      { text: 'Pump RV antifreeze through all fixtures', task: WINTERIZE },
      { text: 'Antifreeze in all drain traps & toilet' },
      { text: 'Deep-clean interior' },
      { text: 'Remove all food' },
      { text: 'Defrost & prop fridge open' },
      { text: 'Remove batteries or put on tender', task: BATTERY },
      { text: 'Inspect & touch up seals', task: SEAMS },
      { text: 'Set rodent deterrents' },
      { text: 'Cover roof vents' },
      { text: 'Remove valuables / electronics' },
      { text: 'Cover or store rig' },
      { text: 'Record tire pressure / chock' },
    ],
  },
];
