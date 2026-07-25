import type { FieldSchema, Interval } from '@rv-checklist/domain';

/**
 * The starter content for a new owner, transcribed from `docs/seed-content.md`
 * (issue #19, rewritten from the maintenance research in issue #34) — the doc is
 * the source of truth; this constant is its typed form. A towable travel
 * trailer's worth of content: 35 maintenance tasks and 9 checklists (4 packing +
 * 5 procedures), with the procedures' ⚙︎ steps referencing tasks **by name**
 * (ids don't exist until seeding creates the tasks) and ✎ steps carrying their
 * own field schemas (ADR-0008).
 *
 * Each task carries a real per-task {@link Interval} (ADR-0015): mostly a
 * calendar `months` cadence — short recurring checks, seasonal tasks, and
 * multi-year age-based replacements alike — plus the two `km` axle jobs. The
 * seed sets **no** last-performed anchor: age-based replacements ship as ordinary
 * calendar tasks the owner anchors to a manufacture date in-app. Event-driven
 * checks (lug re-torque, safety chains, breakaway test) are checklist Steps, not
 * tasks, and the run-hours generator task is out of scope.
 */

export interface SeedTask {
  readonly name: string;
  /** Why the task matters plus a short how — verbatim from the doc (issue #26). */
  readonly description: string;
  /** The task's per-task recurrence — its calendar and/or distance cadence (ADR-0016, issue #34). */
  readonly interval: Interval;
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

// Interval constructors, so a per-task cadence reads at a glance and the metric
// conversions live in one place (ADR-0015). Each seed task carries a single
// limit today; the shape supports both at once (ADR-0016) when a task needs it.
const months = (n: number): Interval => ({ months: n });
const km = (n: number): Interval => ({ km: n });

// Task names, as constants so a ⚙︎ reference can't drift from its task.
const WHEEL_BEARINGS = 'Repack / inspect wheel bearings';
const BRAKES = 'Inspect & adjust brakes';
const TIRE_CHECK = 'Check tire pressure & tread';
const TIRE_AGE = 'Replace aged tires';
const SUSPENSION = 'Inspect suspension & grease wet bolts';
const HITCH = 'Grease hitch & coupler';
const SEALS = 'Inspect roof & exterior seals';
const RESEAL = 'Reseal roof membrane';
const SLIDE_SEALS = 'Condition slide-out seals';
const SLIDE_LUBE = 'Lubricate slide-out mechanism';
const JACK_LUBE = 'Lubricate stabilizer jacks & landing gear';
const AWNING = 'Clean & inspect awning';
const SANITIZE = 'Sanitize fresh water system';
const WINTERIZE = 'Winterize water system';
const DEWINTERIZE = 'De-winterize water system';
const WATER_HEATER_FLUSH = 'Flush water heater';
const ANODE = 'Inspect water-heater anode rod';
const PUMP_FILTER = 'Replace water-pump inlet filter';
const ALARMS = 'Test smoke / CO / LP alarms';
const SMOKE_REPLACE = 'Replace smoke alarm';
const CO_REPLACE = 'Replace CO alarm';
const LP_REPLACE = 'Replace LP gas detector';
const EXTINGUISHER = 'Inspect fire extinguisher';
const EXTINGUISHER_SERVICE = 'Service fire extinguisher';
const PROPANE = 'Propane system leak & pressure test';
const REGULATOR = 'Replace propane regulator';
const CYLINDERS = 'Recertify propane cylinders';
const BATTERY = 'Battery service — charge & terminals';
const CONVERTER = 'Check converter / charger output';
const GFCI = 'Test GFCI outlets';
const FRIDGE_SERVICE = 'Service absorption refrigerator';
const FRIDGE_VENT = 'Check refrigerator vent airflow';
const FURNACE = 'Service furnace';
const AC_FILTER = 'Clean roof A/C filter';
const AC_COILS = 'Service roof A/C coils';

export const SEED_TASKS: readonly SeedTask[] = [
  {
    name: WHEEL_BEARINGS,
    description:
      'Worn or dry wheel bearings can seize or fail at speed, risking a wheel coming off the trailer. How: 1) Raise and support the axle so the wheel spins free; 2) Pull the hub and check the bearings and races for pitting, discoloration, or roughness; 3) Clean and repack (or replace) the bearings with fresh grease; 4) Reassemble, set the bearing preload, and confirm the wheel spins smoothly with no play.',
    interval: km(20_000),
    fieldSchema: [{ name: 'grease type', type: 'text', required: false }],
  },
  {
    name: BRAKES,
    description:
      'Trailer brakes that are worn or out of adjustment lengthen stopping distance and overwork the tow vehicle. How: 1) Raise and support each braked wheel; 2) Inspect the linings and drums or rotors for wear and scoring; 3) Adjust the brakes to the correct running clearance; 4) Test operation and confirm even braking across all wheels.',
    interval: km(5000),
    fieldSchema: [{ name: 'measured pad/shoe', type: 'text', required: false }],
  },
  {
    name: TIRE_CHECK,
    description:
      'Underinflated or worn tires are a leading cause of blowouts, and pressure bleeds off between trips. How: 1) Check and set cold inflation pressure on every tire, including the spare; 2) Measure tread depth and look for uneven wear; 3) Inspect the sidewalls for cracks, bulges, or damage; 4) Correct any low or worn tire before towing.',
    interval: months(1),
    fieldSchema: [
      { name: 'tread depth', type: 'number', required: false, unit: 'mm' },
      { name: 'set pressure', type: 'number', required: false, unit: 'kPa' },
    ],
  },
  {
    name: TIRE_AGE,
    description:
      "RV tires often age out and fail from the inside before the tread ever wears down, so they retire by date, not distance travelled. How: 1) Read the DOT date code on each sidewall to find the tire's age; 2) Weigh that age against its service life; 3) Replace tires that are past their service life even if they look fine; 4) Record the new date codes so the clock restarts.",
    interval: months(72),
    fieldSchema: [{ name: 'DOT date', type: 'text', required: false }],
  },
  {
    name: SUSPENSION,
    description:
      'Worn springs, shackles, and bushings let the axles drift out of line, wearing tires and stressing the frame. How: 1) Inspect springs, shackles, equalizers, and U-bolts for cracks, wear, and loose fasteners; 2) Check for play in the bushings; 3) Grease any wet bolts until fresh grease appears; 4) Retighten fasteners to spec.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: HITCH,
    description:
      'A dry or worn hitch and coupler can bind, wear rapidly, or fail to hold, risking loss of the trailer in tow. How: 1) Clean old grease and dirt from the coupler, ball, and moving hitch parts; 2) Inspect for wear, cracks, or deformation; 3) Apply fresh grease to the ball, coupler, and pivot points; 4) Check that the latch engages and locks securely.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: SEALS,
    description:
      'Roof and body seals are the main defense against water intrusion, and a small gap can rot the structure before it is ever noticed. How: 1) Clean the roof and walk the exterior so every seam is visible; 2) Inspect roof edges, vents, skylights, and all body seams for cracked, lifting, or missing sealant; 3) Note anywhere the sealant has failed; 4) Touch up failed sealant with a compatible product before the next rain.',
    interval: months(3),
    fieldSchema: [],
  },
  {
    name: RESEAL,
    description:
      'Roof membranes and their sealant break down with age and sun, and a full reseal keeps the whole roof watertight between quarterly touch-ups. How: 1) Clean the roof thoroughly; 2) Remove old, failed lap sealant and coating; 3) Apply fresh sealant and, if due, a new roof coating compatible with the membrane; 4) Let it cure fully before exposing it to weather.',
    interval: months(120),
    fieldSchema: [{ name: 'sealant product', type: 'text', required: false }],
  },
  {
    name: SLIDE_SEALS,
    description:
      'Dry, cracked slide-out seals let in water and drafts and can tear as the slide moves. How: 1) Clean the seals with a mild cleaner and let them dry; 2) Inspect for cracks, tears, or flat spots; 3) Apply a rubber-safe conditioner along the seals; 4) Cycle the slide in and out to work the conditioner in.',
    interval: months(6),
    fieldSchema: [{ name: 'product', type: 'text', required: false }],
  },
  {
    name: SLIDE_LUBE,
    description:
      'Slide rails, gears, and rams bind and wear if run dry, and a stuck slide can strand you at setup or teardown. How: 1) Clean grit and old lubricant from the rails, gears, and rams; 2) Inspect for damage or excessive wear; 3) Apply a dry lubricant that will not attract dust; 4) Cycle the slide through its full travel to distribute it.',
    interval: months(3),
    fieldSchema: [],
  },
  {
    name: JACK_LUBE,
    description:
      'Jack screws and landing-gear gearboxes seize and grind if neglected, making setup slow and noisy. How: 1) Clean dirt and old grease from the screws and gearboxes; 2) Inspect for damage or excessive wear; 3) Apply the appropriate lubricant to the threads and gears; 4) Cycle each mechanism through its range to spread the lubricant.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: AWNING,
    description:
      'An awning left dirty grows mildew, and worn fabric or hardware can fail in wind and tear or collapse. How: 1) Extend the awning and clean the fabric of dirt and mildew; 2) Let it dry fully before retracting; 3) Inspect the fabric, arms, and hardware for tears, fraying, or damage; 4) Cycle it to confirm it extends and retracts smoothly.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: SANITIZE,
    description:
      'The fresh water system can harbor bacteria and biofilm, especially after storage, making the water unsafe to drink. How: 1) Drain the fresh water tank and lines; 2) Add a sanitizing solution to the tank and fill with water; 3) Run it through every faucet until you smell it, then let it sit; 4) Drain fully and flush with clean water until the smell is gone.',
    interval: months(6),
    fieldSchema: [],
  },
  {
    name: WINTERIZE,
    description:
      'Water left in the system freezes and expands, cracking pipes, fittings, and the water heater. How: 1) Drain the fresh, gray, and black tanks and the water heater; 2) Bypass the water heater and blow out or drain the lines; 3) Pump RV antifreeze through every faucet and fixture until it runs pink; 4) Add antifreeze to all drain traps and the toilet.',
    interval: months(12),
    fieldSchema: [
      { name: 'antifreeze used', type: 'number', required: false, unit: 'L' },
    ],
  },
  {
    name: DEWINTERIZE,
    description:
      'Antifreeze left in the system tastes bad and should be cleared, and the system should be checked before use. How: 1) Drain any antifreeze from the tanks and lines; 2) Remove the water-heater bypass and reconnect it normally; 3) Flush the system with fresh water until the antifreeze is gone; 4) Sanitize the fresh water system before drinking.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: WATER_HEATER_FLUSH,
    description:
      'Sediment settles in the water heater and cuts its capacity and efficiency while it accelerates tank corrosion. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank; 3) Flush it out until the water runs clear of sediment; 4) Close it up and refill before use.',
    interval: months(6),
    fieldSchema: [],
  },
  {
    name: ANODE,
    description:
      'On steel tanks a sacrificial anode rod corrodes in place of the tank, and a spent rod leaves the tank to rust through. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank and remove the anode rod; 3) Inspect how much of the rod is consumed; 4) Replace it when it is mostly gone, then reinstall and refill. Aluminum-clad tanks have no anode rod and can skip this.',
    interval: months(12),
    fieldSchema: [
      { name: 'anode remaining', type: 'number', required: false, unit: '%' },
    ],
  },
  {
    name: PUMP_FILTER,
    description:
      'A clogged pump inlet screen or inline filter starves the water pump and can taint the water. How: 1) Turn off the pump and relieve system pressure; 2) Remove the inlet screen or inline filter; 3) Clean the screen or fit a fresh filter; 4) Restore pressure and check for leaks.',
    interval: months(6),
    fieldSchema: [],
  },
  {
    name: ALARMS,
    description:
      'Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested regularly. How: 1) Press the test button on each alarm to confirm it sounds; 2) Replace batteries where applicable; 3) Confirm each detector is securely mounted and unobstructed; 4) Note any unit that fails to sound for replacement.',
    interval: months(1),
    fieldSchema: [],
  },
  {
    name: SMOKE_REPLACE,
    description:
      "A smoke alarm's sensor wears out on a fixed clock and must be replaced on schedule even if it still tests good. How: 1) Read the manufacture or expiration date printed on the alarm; 2) Replace the entire unit once it reaches the end of its rated life; 3) Fit a listed replacement; 4) Test the new alarm and record its date.",
    interval: months(120),
    fieldSchema: [],
  },
  {
    name: CO_REPLACE,
    description:
      'A carbon-monoxide alarm has a finite sensor life and stops protecting you once expired, regardless of its battery. How: 1) Read the expiration date printed on the alarm; 2) Replace the entire unit at end of life; 3) Fit a listed replacement; 4) Test the new alarm and record its date.',
    interval: months(60),
    fieldSchema: [],
  },
  {
    name: LP_REPLACE,
    description:
      "An LP (propane) leak detector's sensing element degrades over a few years, after which it can miss a leak pooling at floor level. How: 1) Read the manufacture or expiration date on the detector; 2) Replace the unit once it reaches the printed expiry; 3) Fit a listed replacement at the same low mounting height; 4) Test it and record its date.",
    interval: months(60),
    fieldSchema: [],
  },
  {
    name: EXTINGUISHER,
    description:
      'An extinguisher that is discharged, expired, or blocked is useless in an emergency. How: 1) Confirm the extinguisher is present and easy to reach; 2) Check that the pressure gauge reads in the operating range; 3) Inspect for damage, corrosion, or a broken seal or pin; 4) Note any problem for service or replacement.',
    interval: months(1),
    fieldSchema: [{ name: 'gauge OK', type: 'text', required: false }],
  },
  {
    name: EXTINGUISHER_SERVICE,
    description:
      'Beyond the monthly glance, an extinguisher needs a thorough yearly check to confirm it will actually discharge. How: 1) Weigh or inspect the unit against its charge spec; 2) Check the hose, nozzle, and shell for damage or corrosion; 3) Have it serviced, recharged, or replaced as the annual maintenance requires; 4) Record the service date.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: PROPANE,
    description:
      'A propane leak or a failing system is a fire and explosion hazard, so the whole system is pressure-tested on a schedule. How: 1) With appliances off, pressurize the system and watch for a timed pressure drop; 2) Apply a leak-detection solution to connections to find any leak; 3) Check fittings and hoses for damage or cracking; 4) Fix any leak and confirm the system holds before use.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: REGULATOR,
    description:
      'The propane regulator is a sealed, non-serviceable part that ages out and can deliver low or uneven pressure to appliances. How: 1) Note the regulator’s age or service life; 2) Watch for low, uneven, or sooty appliance flames as warning signs; 3) Replace the regulator with the correct two-stage unit at end of life or when performance drops; 4) Leak-test the new connections.',
    interval: months(120),
    fieldSchema: [],
  },
  {
    name: CYLINDERS,
    description:
      'Removable DOT propane cylinders must be requalified by date before a station may legally refill them. How: 1) Read the manufacture date stamped on each cylinder collar; 2) Have the cylinder requalified once it reaches its recertification age; 3) Repeat on the shorter cycle after the first requalification; 4) Record the new stamp date.',
    interval: months(144),
    fieldSchema: [],
  },
  {
    name: BATTERY,
    description:
      'A neglected battery loses capacity, and corroded terminals cause poor charging and failures; flooded cells also lose water. How: 1) Check the state of charge and charge it fully; 2) Clean any corrosion from the terminals and connections; 3) On flooded batteries, check the electrolyte and top up with distilled water; 4) Confirm tight connections and a healthy resting voltage.',
    interval: months(1),
    fieldSchema: [
      { name: 'resting voltage', type: 'number', required: false, unit: 'V' },
    ],
  },
  {
    name: CONVERTER,
    description:
      'A failing converter overcharges or undercharges the battery, shortening its life or leaving you without power. How: 1) With shore power connected, measure the converter’s output voltage; 2) Confirm it sits in the correct float and charging range; 3) Check for dimming lights, buzzing, or overheating; 4) Keep the unit ventilated and dust-free.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: GFCI,
    description:
      'GFCI outlets protect the wet-area circuits and can fail silently, leaving no shock protection. How: 1) Press Test on each GFCI and confirm it trips; 2) Confirm the protected outlets lose power; 3) Press Reset and confirm power returns; 4) Replace any GFCI that will not trip or reset.',
    interval: months(1),
    fieldSchema: [],
  },
  {
    name: FRIDGE_SERVICE,
    description:
      "An absorption fridge's burner and flue collect soot and insect nests that hurt cooling and can be a fire risk. How: 1) Shut off the fridge and let it cool; 2) Clean the burner, orifice, and flue; 3) Check the flame and ventilation and clear any nests; 4) Confirm it cools on each power source.",
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: FRIDGE_VENT,
    description:
      'The rear vent and coils shed heat for the fridge, and blocked airflow or spider nests in the burner tube kill cooling. How: 1) Open the exterior vent access; 2) Inspect the coils and burner tube for dust, soot, and insect nests; 3) Clear any obstruction to airflow; 4) Confirm the vents are open and unblocked.',
    interval: months(6),
    fieldSchema: [],
  },
  {
    name: FURNACE,
    description:
      'A forced-air furnace collects dust and nests over the off-season that can block the burner or exhaust and run it unsafely. How: 1) Clean the burner and blower; 2) Check the igniter and sail switch; 3) Clear the exhaust and intake of debris and insect nests; 4) Run the furnace and confirm it lights and heats cleanly.',
    interval: months(12),
    fieldSchema: [],
  },
  {
    name: AC_FILTER,
    description:
      'A clogged return-air filter chokes the air conditioner, cutting cooling and overworking the unit. How: 1) Open the interior return-air grille; 2) Remove the filter; 3) Wash or replace it and let it dry; 4) Refit it and confirm good airflow.',
    interval: months(1),
    fieldSchema: [],
  },
  {
    name: AC_COILS,
    description:
      'Dirty condenser and evaporator coils and blocked drains rob the A/C of capacity and can leak water into the coach. How: 1) Remove the rooftop shroud; 2) Clean the condenser and evaporator coils; 3) Clear the drain and weep holes; 4) Check the gaskets and mounting bolts and reassemble.',
    interval: months(12),
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
      { text: 'Inspect roof & exterior seals', task: SEALS },
      { text: 'Condition slide seals', task: SLIDE_SEALS },
      { text: 'De-winterize water system', task: DEWINTERIZE },
      { text: 'Sanitize fresh water', task: SANITIZE },
      { text: 'Check tire pressure & tread', task: TIRE_CHECK },
      { text: 'Repack wheel bearings', task: WHEEL_BEARINGS },
      { text: 'Check brakes', task: BRAKES },
      { text: 'Inspect suspension & wet bolts', task: SUSPENSION },
      { text: 'Battery back in & charge', task: BATTERY },
      { text: 'Test alarms', task: ALARMS },
      { text: 'Propane leak & pressure test', task: PROPANE },
      { text: 'Service furnace', task: FURNACE },
      { text: 'Service A/C coils', task: AC_COILS },
      { text: 'Service refrigerator', task: FRIDGE_SERVICE },
      { text: 'Lubricate slide-out mechanism', task: SLIDE_LUBE },
      { text: 'Lubricate jacks & landing gear', task: JACK_LUBE },
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
      { text: 'Inspect safety chains & breakaway cable' },
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
        text: 'Hitch up (coupler latched & locked, weight-distribution bars, sway control)',
      },
      { text: 'Cross & inspect safety chains' },
      {
        text: 'Test breakaway switch (battery holds, pin pulls, brakes engage)',
      },
      {
        text: 'Re-torque lug nuts if a wheel was removed (recheck at 16 / 40 / 80 km)',
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
      { text: 'Flush water heater', task: WATER_HEATER_FLUSH },
      { text: 'Check anode rod', task: ANODE },
      { text: 'Bypass water heater' },
      { text: 'Blow out water lines' },
      { text: 'Pump RV antifreeze through all fixtures', task: WINTERIZE },
      { text: 'Antifreeze in all drain traps & toilet' },
      { text: 'Deep-clean interior' },
      { text: 'Remove all food' },
      { text: 'Defrost & prop fridge open' },
      { text: 'Remove batteries or put on tender', task: BATTERY },
      { text: 'Inspect & touch up seals', task: SEALS },
      { text: 'Set rodent deterrents' },
      { text: 'Cover roof vents' },
      { text: 'Remove valuables / electronics' },
      { text: 'Cover or store rig' },
      { text: 'Record tire pressure / chock' },
    ],
  },
];
