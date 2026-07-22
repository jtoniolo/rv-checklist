# Seed content — default checklists & maintenance tasks

Starter content shipped with the app. Per [ADR-0010](adr/0010-mvp-scope.md) these are **editable seeded starter checklists** — this doc is the source for the seed, not a frozen spec; the owner refines it in-app.

Scope decisions made while seeding:

- **Rig type:** towable **travel trailer** (hitch, weight-distribution, tow lights). A different rig type (fifth-wheel, motorhome, pop-up) would change the hitch/departure steps.
- **No campsite-setup checklist** — setup is self-evident (everything is in front of you); the object-permanence failure mode doesn't apply. See the purpose line in `CONTEXT.md`.
- **One packing list per stage**, not per trip length — trip length changes quantities and a few items, handled by `skip` and duplicating a list. (Trip-length splitting is deliberately out of the seed.)
- **Usage readings** (fresh water, tanks, odometer) live as custom fields on **Departure**; there is no separate return-home list.
- **No `photo` field type** in seed tasks — deferred post-MVP (ADR-0010, ADR-0007).

Notation below: **⚙︎ →** *Task* marks a step that links to a maintenance task (completing it logs maintenance); **✎** marks a plain step that carries its own custom fields.

## Maintenance tasks

The recurring upkeep jobs. Intervals drive due/overdue (computed on read). Steps in the procedures link to these.

| Task | Interval (months) | Custom fields |
|---|---|---|
| Repack / inspect wheel bearings | 12 | grease type (text), odometer (number, mi) |
| Inspect & adjust brakes | 12 | measured pad/shoe (text) |
| Inspect tires — pressure, tread, age | 12 | tread depth (number, /32"), DOT date (text), set pressure (number, psi) |
| Inspect & reseal roof | 12 | sealant product (text) |
| Inspect exterior seams & seals | 12 | — |
| Condition slide-out seals | 12 | product (text) |
| Lubricate slides / jacks / stabilizers | 12 | — |
| Sanitize fresh water system | 12 (spring) | — |
| Winterize water system | 12 (fall) | antifreeze gallons used (number) |
| De-winterize water system | 12 (spring) | — |
| Flush water heater / check anode rod | 12 | anode remaining (number, %) |
| Propane system leak test & regulator check | 12 | — |
| Test smoke / CO / propane alarms | 12 | — |
| Inspect fire extinguisher | 12 | gauge OK (text) |
| Battery service — charge & terminals | 12 | resting voltage (number, V) |
| Repack / grease hitch & coupler | 12 | — |

### Descriptions

Each task ships with a short **description** — one or two sentences on *why* it matters plus a basic *how* outline. Descriptions are general and make/model-agnostic: a starting point the owner refines in-app, not an exhaustive procedure. Transcribe these verbatim into `apps/api/src/app/seed/seed-content.ts`; this doc is the source of truth.

- **Repack / inspect wheel bearings** — Worn or dry wheel bearings can seize or fail at speed, risking a wheel coming off the trailer. How: 1) Raise and support the axle so the wheel spins free; 2) Pull the hub and check the bearings and races for pitting, discoloration, or roughness; 3) Clean and repack (or replace) the bearings with fresh grease; 4) Reassemble, set the bearing preload, and confirm the wheel spins smoothly with no play.
- **Inspect & adjust brakes** — Trailer brakes that are worn or out of adjustment lengthen stopping distance and overwork the tow vehicle. How: 1) Raise and support each braked wheel; 2) Inspect the linings and drums or rotors for wear and scoring; 3) Adjust the brakes to the correct running clearance; 4) Test operation and confirm even braking across all wheels.
- **Inspect tires — pressure, tread, age** — Underinflated, worn, or aged tires are a leading cause of blowouts, and RV tires often age out before the tread wears down. How: 1) Check and set cold inflation pressure on every tire, including the spare; 2) Measure tread depth and look for uneven wear; 3) Inspect the sidewalls for cracks, bulges, or damage; 4) Read the date code and weigh the tire's age against its service life.
- **Inspect & reseal roof** — A roof left unsealed lets water in, and hidden leaks cause expensive structural and interior damage. How: 1) Clean the roof so the seams and sealant are visible; 2) Inspect all seams, edges, and openings for cracked, lifting, or missing sealant; 3) Remove failed sealant where needed; 4) Apply fresh sealant compatible with the roof material and let it cure.
- **Inspect exterior seams & seals** — Exterior seams and seals are the main defense against water intrusion, and gaps here lead to rot and mold. How: 1) Walk the exterior and inspect every seam, window, door, and penetration; 2) Look for cracked, shrunken, or peeling sealant; 3) Clean out any failed material; 4) Re-seal with an appropriate sealant and confirm a continuous bead.
- **Condition slide-out seals** — Dry, cracked slide-out seals let in water and drafts and can tear as the slide moves. How: 1) Clean the seals with a mild cleaner and let them dry; 2) Inspect for cracks, tears, or flat spots; 3) Apply a rubber-safe conditioner along the seals; 4) Cycle the slide in and out to work the conditioner in.
- **Lubricate slides / jacks / stabilizers** — Moving mechanisms bind, wear, and can fail if run dry, making setup harder and travel less safe. How: 1) Clean dirt and old grease from the slide rails, jack screws, and stabilizer mechanisms; 2) Inspect for damage or excessive wear; 3) Apply the appropriate lubricant to each moving part; 4) Cycle each mechanism through its range to distribute the lubricant.
- **Sanitize fresh water system** — The fresh water system can harbor bacteria and biofilm, especially after storage, making the water unsafe to drink. How: 1) Drain the fresh water tank and lines; 2) Add a sanitizing solution to the tank and fill with water; 3) Run it through every faucet until you smell it, then let it sit; 4) Drain fully and flush with clean water until the smell is gone.
- **Winterize water system** — Water left in the system freezes and expands, cracking pipes, fittings, and the water heater. How: 1) Drain the fresh, gray, and black tanks and the water heater; 2) Bypass the water heater and blow out or drain the lines; 3) Pump RV antifreeze through every faucet and fixture until it runs pink; 4) Add antifreeze to all drain traps and the toilet.
- **De-winterize water system** — Antifreeze left in the system tastes bad and should be cleared, and the system should be checked before use. How: 1) Drain any antifreeze from the tanks and lines; 2) Remove the water-heater bypass and reconnect it normally; 3) Flush the system with fresh water until the antifreeze is gone; 4) Sanitize the fresh water system before drinking.
- **Flush water heater / check anode rod** — Sediment builds up in the water heater and cuts efficiency, and a spent anode rod lets the tank corrode. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank and remove the drain plug or anode rod; 3) Flush out the sediment until the water runs clear; 4) Inspect the anode rod, replace it if heavily consumed, then reinstall and refill.
- **Propane system leak test & regulator check** — A propane leak or a failing regulator is a fire and explosion hazard and can make appliances run unsafely. How: 1) With the system charged and appliances off, watch for a pressure drop or apply a leak-detection solution to the connections; 2) Check fittings and hoses for damage or cracking; 3) Verify the regulator delivers correct, steady pressure; 4) Fix any leak before use and confirm the system holds.
- **Test smoke / CO / propane alarms** — Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested and dated. How: 1) Press the test button on each alarm to confirm it sounds; 2) Check the manufacture or expiration date and replace expired units; 3) Replace batteries where applicable; 4) Confirm each detector is securely mounted and unobstructed.
- **Inspect fire extinguisher** — An extinguisher that is discharged, expired, or blocked is useless in an emergency. How: 1) Confirm the extinguisher is present and easy to reach; 2) Check that the pressure gauge reads in the operating range; 3) Inspect for damage, corrosion, or a broken seal or pin; 4) Verify it is within its service life and recharge or replace it as needed.
- **Battery service — charge & terminals** — A neglected battery loses capacity, and corroded terminals cause hard starts, poor charging, and failures. How: 1) Check the state of charge and charge it fully; 2) Clean any corrosion from the terminals and connections; 3) Inspect the case for damage and, if serviceable, check the fluid levels; 4) Confirm tight connections and a healthy resting voltage.
- **Repack / grease hitch & coupler** — A dry or worn hitch and coupler can bind, wear rapidly, or fail to hold, risking loss of the trailer in tow. How: 1) Clean old grease and dirt from the coupler, ball, and moving hitch parts; 2) Inspect for wear, cracks, or deformation; 3) Apply fresh grease to the ball, coupler, and pivot points; 4) Check that the latch engages and locks securely.

## Packing lists

### Season load-in
Tags: `packing`, `season-start`. Packed into the trailer once at season start; lives there all summer.

- Camp chairs
- Outdoor mat / rug
- Leveling blocks & wheel chocks
- Hitch gear (weight-distribution bars, sway control, pin, lock)
- Sewer hose kit
- Fresh-water (potable) hose
- Water pressure regulator
- Surge protector / EMS
- 30/50A adapters
- Extension cords
- Toolbox & duct tape
- Tire-change kit (jack, blocks, lug wrench, gloves)
- First-aid kit
- Fire extinguisher (verify present & charged)
- Flashlights / headlamps
- Broom & dustpan
- Bins for kitchen / bath basics
- Spare fuses
- Level / leveling app

### Trip packing — ahead
Tags: `packing`, `trip`. Packed in the days before a trip.

- Clothing by forecast
- Bedding & pillows
- Towels
- Toiletries
- Medications
- Phone / device chargers
- Camp kitchen (pots, utensils, coffee maker)
- Dish soap & sponges
- Trash bags
- Lighter / matches
- Bug spray & sunscreen
- Outdoor games
- Books / entertainment
- Laundry bag
- Reservation confirmations / permits
- Cash for firewood
- ✎ **Fresh water level** (number, %) — top up before leaving

### Trip packing — day-of
Tags: `packing`, `trip`, `day-of`. Can only go the morning you leave.

- Perishable food from home fridge
- Ice
- Leftovers / prepped meals
- Daily meds
- Phones & laptops off chargers
- Kids' / pet comfort items
- Anything charging overnight
- Glasses / sunglasses
- Wallet & keys
- Last-minute forecast recheck

### Food
Tags: `packing`, `food`. Its own list; a stable staples core plus per-trip groceries.

Staples core:

- Coffee & filters
- Salt / pepper / oil
- Spices
- Condiments (ketchup, mustard, mayo)
- Cooking spray
- Sugar
- Foil & storage bags
- Paper towels
- Napkins
- Dish soap
- S'mores kit
- Water / drinks

Per-trip:

- Breakfast items
- Lunch items
- Dinner ingredients
- Snacks
- Pet food
- Pet treats

## Procedures

### Spring opening
Tags: `procedure`, `spring`. Spans days/weeks — pull from storage plus yearly maintenance.

- Remove cover / pull from storage
- Exterior wash
- Inspect roof for winter damage — **⚙︎ →** *Inspect & reseal roof*
- Inspect seams / seals — **⚙︎ →** *Inspect exterior seams & seals*
- Condition slide seals — **⚙︎ →** *Condition slide-out seals*
- De-winterize water system — **⚙︎ →** *De-winterize water system*
- Sanitize fresh water — **⚙︎ →** *Sanitize fresh water system*
- Check tires — **⚙︎ →** *Inspect tires*
- Repack wheel bearings — **⚙︎ →** *Repack / inspect wheel bearings*
- Check brakes — **⚙︎ →** *Inspect & adjust brakes*
- Battery back in & charge — **⚙︎ →** *Battery service*
- Test alarms — **⚙︎ →** *Test smoke / CO / propane alarms*
- Propane leak test — **⚙︎ →** *Propane system leak test*
- Run fridge on all sources
- Test A/C & furnace
- Lubricate slides / jacks — **⚙︎ →** *Lubricate slides / jacks / stabilizers*
- Restock consumables

### Pre-trip prep
Tags: `procedure`, `trip-prep`. 1–2 weeks out, with slack to fix / replace.

- Confirm reservations
- Check weather trend
- Charge battery
- Check tire pressure (all incl. spare)
- Test fridge cools down
- Fill propane
- Inspect hitch & coupler
- Test running / brake / turn lights
- Flush & fill fresh water
- Verify sewer / water hoses present
- Restock first-aid & meds
- Check fire extinguisher gauge
- Note anything to fix / replace (the slack week)

### Departure
Tags: `procedure`, `departure`. Works leaving home or leaving a campsite.

- Retract / stow slides
- Lower antenna & roof vents
- Latch fridge & cabinets
- Secure loose items
- Close & lock windows
- Turn off water pump
- Turn off propane at tank
- Retract stabilizers / jacks
- Hitch up (coupler latched & locked, weight-distribution bars, sway control, safety chains, breakaway cable)
- Connect & test lights (running / brake / turn)
- Walk-around: chocks removed, steps in, hatches closed, tow mirrors set
- Final tire-pressure glance
- Do a full lap of the site
- ✎ **Fresh water on board** (number, %)
- ✎ **Gray / black tank levels** (text)
- ✎ **Odometer** (number, mi)

### Campsite teardown
Tags: `procedure`, `teardown`. Simple; run before Departure.

- Dump black then gray tanks
- Rinse & stow sewer hose
- Disconnect & stow water hose & regulator
- Disconnect & stow power cord / adapters
- Bring in outdoor mat, chairs, grill
- Take down awning
- Pack outdoor gear
- Trash to bins
- Quick interior stow
- (→ then run Departure)

### Fall closing / winterization
Tags: `procedure`, `fall`, `winterize`. Prep for storage.

- Drain fresh / gray / black tanks
- Flush water heater & check anode — **⚙︎ →** *Flush water heater / check anode rod*
- Bypass water heater
- Blow out water lines
- Pump RV antifreeze through all fixtures — **⚙︎ →** *Winterize water system*
- Antifreeze in all drain traps & toilet
- Deep-clean interior
- Remove all food
- Defrost & prop fridge open
- Remove batteries or put on tender — **⚙︎ →** *Battery service*
- Inspect & touch up seals — **⚙︎ →** *Inspect exterior seams & seals*
- Set rodent deterrents
- Cover roof vents
- Remove valuables / electronics
- Cover or store rig
- Record tire pressure / chock
