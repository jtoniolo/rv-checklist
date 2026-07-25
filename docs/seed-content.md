# Seed content — default checklists & maintenance tasks

Starter content shipped with the app. Per [ADR-0010](adr/0010-mvp-scope.md) these are **editable seeded starter checklists** — this doc is the source for the seed, not a frozen spec; the owner refines it in-app.

This set is transcribed from the maintenance research
(`research/2026-07-23-towable-rv-maintenance-intervals.md`) — the research is the
source of truth for every basis and interval below (ADR-0015). The earlier flat
12-month set was wrong for roughly half the tasks and has been discarded.

Scope decisions made while seeding:

- **Rig type:** towable **travel trailer** (hitch, weight-distribution, tow lights). A different rig type (fifth-wheel, motorhome, pop-up) would change the hitch/departure steps.
- **No campsite-setup checklist** — setup is self-evident (everything is in front of you); the object-permanence failure mode doesn't apply. See the purpose line in `CONTEXT.md`.
- **One packing list per stage**, not per trip length — trip length changes quantities and a few items, handled by `skip` and duplicating a list. (Trip-length splitting is deliberately out of the seed.)
- **Usage readings** (fresh water, tanks) live as custom fields on **Departure**. Travel **Distance** is *not* a Departure custom field: it is the rig's own structured Distance, recorded on the **Log Entry** when a distance task is performed (ADR-0015). The old ad-hoc `odometer` custom field is gone.
- **No `photo` field type** in seed tasks — deferred post-MVP (ADR-0010, ADR-0007).

### Interval limits (ADR-0015, ADR-0016)

Each **Maintenance Task** carries a per-task **Interval** with two optional
limits, **at least one** present (ADR-0016):

- **calendar** — a whole number of **months** (short recurring checks, seasonal
  tasks anchored to their season, and multi-year age-based replacements alike);
- **distance** — a whole number of **kilometres**, measured against the rig's
  **Distance** — trailer-axle service is spec'd by distance, not the clock.

The two **trailer-axle jobs carry BOTH** limits — their spec is "X or Y,
whichever comes first" (ADR-0016): **wheel bearings** every 12 months **or**
12,000 mi, and **brakes** inspected annually **or** adjusted every 3,000 mi. The
calendar leg catches the rig that sits all season; the distance leg catches the
rig that travels. Every other task carries a single (calendar) limit.

**Metric conversions** applied from the research's imperial specs: wheel bearings
12,000 mi → **20,000 km**; brake adjustment 3,000 mi → **5,000 km**; tread depth
2/32″ → **~1.6 mm** (recorded in **mm**); tire pressure recorded in **kPa**;
winterize antifreeze in **litres**.

**Not seeded as tasks.** Purely **event-driven** checks ("before every trip",
"after any wheel removal") are **not** Intervals (ADR-0015) — they live as
checklist **Steps** on Departure / Pre-trip: lug-nut re-torque, safety-chain
inspection, and the breakaway-switch test. The onboard-**generator** task is out
of scope (most travel trailers have none; its cadence is run-hours, an unmodelled
basis) and is **cut**.

**Age-based replacements** (replace smoke alarm, CO alarm, LP detector, propane
regulator, recertify cylinders, replace aged tires, reseal roof) ship as ordinary
**calendar** tasks with **no** seed last-performed value — the owner anchors each
to its manufacture / install date in-app (ADR-0015).

Notation below: **⚙︎ →** *Task* marks a step that links to a maintenance task (completing it logs maintenance); **✎** marks a plain step that carries its own custom fields.

## Maintenance tasks

The recurring upkeep jobs. Intervals drive due/overdue (computed on read). Steps in the procedures link to these. Multi-cadence chores (test vs replace an alarm; flush vs anode; slide vs jack lube; inspect vs annual-service an extinguisher) are **split into separate single-interval tasks**.

| Task | Interval | Basis | Custom fields |
|---|---|---|---|
| Repack / inspect wheel bearings | 12 months **or** 20,000 km | calendar + distance | grease type (text) |
| Inspect & adjust brakes | 12 months **or** 5,000 km | calendar + distance | measured pad/shoe (text) |
| Check tire pressure & tread | 1 month | calendar | tread depth (number, mm), set pressure (number, kPa) |
| Replace aged tires | 72 months | calendar (age) | DOT date (text) |
| Inspect suspension & grease wet bolts | 12 months | calendar | — |
| Grease hitch & coupler | 12 months | calendar | — |
| Inspect roof & exterior seals | 3 months | calendar | — |
| Reseal roof membrane | 120 months | calendar (age) | sealant product (text) |
| Condition slide-out seals | 6 months | calendar | product (text) |
| Lubricate slide-out mechanism | 3 months | calendar | — |
| Lubricate stabilizer jacks & landing gear | 12 months | calendar | — |
| Clean & inspect awning | 12 months | calendar | — |
| Sanitize fresh water system | 6 months | calendar | — |
| Winterize water system | 12 months | calendar (fall) | antifreeze used (number, L) |
| De-winterize water system | 12 months | calendar (spring) | — |
| Flush water heater | 6 months | calendar | — |
| Inspect water-heater anode rod | 12 months | calendar | anode remaining (number, %) |
| Replace water-pump inlet filter | 6 months | calendar | — |
| Test smoke / CO / LP alarms | 1 month | calendar | — |
| Replace smoke alarm | 120 months | calendar (age) | — |
| Replace CO alarm | 60 months | calendar (age) | — |
| Replace LP gas detector | 60 months | calendar (age) | — |
| Inspect fire extinguisher | 1 month | calendar | gauge OK (text) |
| Service fire extinguisher | 12 months | calendar | — |
| Propane system leak & pressure test | 12 months | calendar | — |
| Replace propane regulator | 120 months | calendar (age) | — |
| Recertify propane cylinders | 144 months | calendar (age) | — |
| Battery service — charge & terminals | 1 month | calendar | resting voltage (number, V) |
| Check converter / charger output | 12 months | calendar | — |
| Test GFCI outlets | 1 month | calendar | — |
| Service absorption refrigerator | 12 months | calendar | — |
| Check refrigerator vent airflow | 6 months | calendar | — |
| Service furnace | 12 months | calendar | — |
| Clean roof A/C filter | 1 month | calendar | — |
| Service roof A/C coils | 12 months | calendar | — |

### Descriptions

Each task ships with a short **description** — one or two sentences on *why* it matters plus a basic *how* outline. Descriptions are general and make/model-agnostic: a starting point the owner refines in-app, not an exhaustive procedure. Transcribe these verbatim into `apps/api/src/app/seed/seed-content.ts`; this doc is the source of truth.

- **Repack / inspect wheel bearings** — Worn or dry wheel bearings can seize or fail at speed, risking a wheel coming off the trailer. How: 1) Raise and support the axle so the wheel spins free; 2) Pull the hub and check the bearings and races for pitting, discoloration, or roughness; 3) Clean and repack (or replace) the bearings with fresh grease; 4) Reassemble, set the bearing preload, and confirm the wheel spins smoothly with no play.
- **Inspect & adjust brakes** — Trailer brakes that are worn or out of adjustment lengthen stopping distance and overwork the tow vehicle. How: 1) Raise and support each braked wheel; 2) Inspect the linings and drums or rotors for wear and scoring; 3) Adjust the brakes to the correct running clearance; 4) Test operation and confirm even braking across all wheels.
- **Check tire pressure & tread** — Underinflated or worn tires are a leading cause of blowouts, and pressure bleeds off between trips. How: 1) Check and set cold inflation pressure on every tire, including the spare; 2) Measure tread depth and look for uneven wear; 3) Inspect the sidewalls for cracks, bulges, or damage; 4) Correct any low or worn tire before towing.
- **Replace aged tires** — RV tires often age out and fail from the inside before the tread ever wears down, so they retire by date, not distance travelled. How: 1) Read the DOT date code on each sidewall to find the tire's age; 2) Weigh that age against its service life; 3) Replace tires that are past their service life even if they look fine; 4) Record the new date codes so the clock restarts.
- **Inspect suspension & grease wet bolts** — Worn springs, shackles, and bushings let the axles drift out of line, wearing tires and stressing the frame. How: 1) Inspect springs, shackles, equalizers, and U-bolts for cracks, wear, and loose fasteners; 2) Check for play in the bushings; 3) Grease any wet bolts until fresh grease appears; 4) Retighten fasteners to spec.
- **Grease hitch & coupler** — A dry or worn hitch and coupler can bind, wear rapidly, or fail to hold, risking loss of the trailer in tow. How: 1) Clean old grease and dirt from the coupler, ball, and moving hitch parts; 2) Inspect for wear, cracks, or deformation; 3) Apply fresh grease to the ball, coupler, and pivot points; 4) Check that the latch engages and locks securely.
- **Inspect roof & exterior seals** — Roof and body seals are the main defense against water intrusion, and a small gap can rot the structure before it is ever noticed. How: 1) Clean the roof and walk the exterior so every seam is visible; 2) Inspect roof edges, vents, skylights, and all body seams for cracked, lifting, or missing sealant; 3) Note anywhere the sealant has failed; 4) Touch up failed sealant with a compatible product before the next rain.
- **Reseal roof membrane** — Roof membranes and their sealant break down with age and sun, and a full reseal keeps the whole roof watertight between quarterly touch-ups. How: 1) Clean the roof thoroughly; 2) Remove old, failed lap sealant and coating; 3) Apply fresh sealant and, if due, a new roof coating compatible with the membrane; 4) Let it cure fully before exposing it to weather.
- **Condition slide-out seals** — Dry, cracked slide-out seals let in water and drafts and can tear as the slide moves. How: 1) Clean the seals with a mild cleaner and let them dry; 2) Inspect for cracks, tears, or flat spots; 3) Apply a rubber-safe conditioner along the seals; 4) Cycle the slide in and out to work the conditioner in.
- **Lubricate slide-out mechanism** — Slide rails, gears, and rams bind and wear if run dry, and a stuck slide can strand you at setup or teardown. How: 1) Clean grit and old lubricant from the rails, gears, and rams; 2) Inspect for damage or excessive wear; 3) Apply a dry lubricant that will not attract dust; 4) Cycle the slide through its full travel to distribute it.
- **Lubricate stabilizer jacks & landing gear** — Jack screws and landing-gear gearboxes seize and grind if neglected, making setup slow and noisy. How: 1) Clean dirt and old grease from the screws and gearboxes; 2) Inspect for damage or excessive wear; 3) Apply the appropriate lubricant to the threads and gears; 4) Cycle each mechanism through its range to spread the lubricant.
- **Clean & inspect awning** — An awning left dirty grows mildew, and worn fabric or hardware can fail in wind and tear or collapse. How: 1) Extend the awning and clean the fabric of dirt and mildew; 2) Let it dry fully before retracting; 3) Inspect the fabric, arms, and hardware for tears, fraying, or damage; 4) Cycle it to confirm it extends and retracts smoothly.
- **Sanitize fresh water system** — The fresh water system can harbor bacteria and biofilm, especially after storage, making the water unsafe to drink. How: 1) Drain the fresh water tank and lines; 2) Add a sanitizing solution to the tank and fill with water; 3) Run it through every faucet until you smell it, then let it sit; 4) Drain fully and flush with clean water until the smell is gone.
- **Winterize water system** — Water left in the system freezes and expands, cracking pipes, fittings, and the water heater. How: 1) Drain the fresh, gray, and black tanks and the water heater; 2) Bypass the water heater and blow out or drain the lines; 3) Pump RV antifreeze through every faucet and fixture until it runs pink; 4) Add antifreeze to all drain traps and the toilet.
- **De-winterize water system** — Antifreeze left in the system tastes bad and should be cleared, and the system should be checked before use. How: 1) Drain any antifreeze from the tanks and lines; 2) Remove the water-heater bypass and reconnect it normally; 3) Flush the system with fresh water until the antifreeze is gone; 4) Sanitize the fresh water system before drinking.
- **Flush water heater** — Sediment settles in the water heater and cuts its capacity and efficiency while it accelerates tank corrosion. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank; 3) Flush it out until the water runs clear of sediment; 4) Close it up and refill before use.
- **Inspect water-heater anode rod** — On steel tanks a sacrificial anode rod corrodes in place of the tank, and a spent rod leaves the tank to rust through. How: 1) Turn off the water heater, let it cool, and relieve the pressure; 2) Drain the tank and remove the anode rod; 3) Inspect how much of the rod is consumed; 4) Replace it when it is mostly gone, then reinstall and refill. Aluminum-clad tanks have no anode rod and can skip this.
- **Replace water-pump inlet filter** — A clogged pump inlet screen or inline filter starves the water pump and can taint the water. How: 1) Turn off the pump and relieve system pressure; 2) Remove the inlet screen or inline filter; 3) Clean the screen or fit a fresh filter; 4) Restore pressure and check for leaks.
- **Test smoke / CO / LP alarms** — Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested regularly. How: 1) Press the test button on each alarm to confirm it sounds; 2) Replace batteries where applicable; 3) Confirm each detector is securely mounted and unobstructed; 4) Note any unit that fails to sound for replacement.
- **Replace smoke alarm** — A smoke alarm's sensor wears out on a fixed clock and must be replaced on schedule even if it still tests good. How: 1) Read the manufacture or expiration date printed on the alarm; 2) Replace the entire unit once it reaches the end of its rated life; 3) Fit a listed replacement; 4) Test the new alarm and record its date.
- **Replace CO alarm** — A carbon-monoxide alarm has a finite sensor life and stops protecting you once expired, regardless of its battery. How: 1) Read the expiration date printed on the alarm; 2) Replace the entire unit at end of life; 3) Fit a listed replacement; 4) Test the new alarm and record its date.
- **Replace LP gas detector** — An LP (propane) leak detector's sensing element degrades over a few years, after which it can miss a leak pooling at floor level. How: 1) Read the manufacture or expiration date on the detector; 2) Replace the unit once it reaches the printed expiry; 3) Fit a listed replacement at the same low mounting height; 4) Test it and record its date.
- **Inspect fire extinguisher** — An extinguisher that is discharged, expired, or blocked is useless in an emergency. How: 1) Confirm the extinguisher is present and easy to reach; 2) Check that the pressure gauge reads in the operating range; 3) Inspect for damage, corrosion, or a broken seal or pin; 4) Note any problem for service or replacement.
- **Service fire extinguisher** — Beyond the monthly glance, an extinguisher needs a thorough yearly check to confirm it will actually discharge. How: 1) Weigh or inspect the unit against its charge spec; 2) Check the hose, nozzle, and shell for damage or corrosion; 3) Have it serviced, recharged, or replaced as the annual maintenance requires; 4) Record the service date.
- **Propane system leak & pressure test** — A propane leak or a failing system is a fire and explosion hazard, so the whole system is pressure-tested on a schedule. How: 1) With appliances off, pressurize the system and watch for a timed pressure drop; 2) Apply a leak-detection solution to connections to find any leak; 3) Check fittings and hoses for damage or cracking; 4) Fix any leak and confirm the system holds before use.
- **Replace propane regulator** — The propane regulator is a sealed, non-serviceable part that ages out and can deliver low or uneven pressure to appliances. How: 1) Note the regulator's age or service life; 2) Watch for low, uneven, or sooty appliance flames as warning signs; 3) Replace the regulator with the correct two-stage unit at end of life or when performance drops; 4) Leak-test the new connections.
- **Recertify propane cylinders** — Removable DOT propane cylinders must be requalified by date before a station may legally refill them. How: 1) Read the manufacture date stamped on each cylinder collar; 2) Have the cylinder requalified once it reaches its recertification age; 3) Repeat on the shorter cycle after the first requalification; 4) Record the new stamp date.
- **Battery service — charge & terminals** — A neglected battery loses capacity, and corroded terminals cause poor charging and failures; flooded cells also lose water. How: 1) Check the state of charge and charge it fully; 2) Clean any corrosion from the terminals and connections; 3) On flooded batteries, check the electrolyte and top up with distilled water; 4) Confirm tight connections and a healthy resting voltage.
- **Check converter / charger output** — A failing converter overcharges or undercharges the battery, shortening its life or leaving you without power. How: 1) With shore power connected, measure the converter's output voltage; 2) Confirm it sits in the correct float and charging range; 3) Check for dimming lights, buzzing, or overheating; 4) Keep the unit ventilated and dust-free.
- **Test GFCI outlets** — GFCI outlets protect the wet-area circuits and can fail silently, leaving no shock protection. How: 1) Press Test on each GFCI and confirm it trips; 2) Confirm the protected outlets lose power; 3) Press Reset and confirm power returns; 4) Replace any GFCI that will not trip or reset.
- **Service absorption refrigerator** — An absorption fridge's burner and flue collect soot and insect nests that hurt cooling and can be a fire risk. How: 1) Shut off the fridge and let it cool; 2) Clean the burner, orifice, and flue; 3) Check the flame and ventilation and clear any nests; 4) Confirm it cools on each power source.
- **Check refrigerator vent airflow** — The rear vent and coils shed heat for the fridge, and blocked airflow or spider nests in the burner tube kill cooling. How: 1) Open the exterior vent access; 2) Inspect the coils and burner tube for dust, soot, and insect nests; 3) Clear any obstruction to airflow; 4) Confirm the vents are open and unblocked.
- **Service furnace** — A forced-air furnace collects dust and nests over the off-season that can block the burner or exhaust and run it unsafely. How: 1) Clean the burner and blower; 2) Check the igniter and sail switch; 3) Clear the exhaust and intake of debris and insect nests; 4) Run the furnace and confirm it lights and heats cleanly.
- **Clean roof A/C filter** — A clogged return-air filter chokes the air conditioner, cutting cooling and overworking the unit. How: 1) Open the interior return-air grille; 2) Remove the filter; 3) Wash or replace it and let it dry; 4) Refit it and confirm good airflow.
- **Service roof A/C coils** — Dirty condenser and evaporator coils and blocked drains rob the A/C of capacity and can leak water into the coach. How: 1) Remove the rooftop shroud; 2) Clean the condenser and evaporator coils; 3) Clear the drain and weep holes; 4) Check the gaskets and mounting bolts and reassemble.

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
- Inspect roof & exterior seals — **⚙︎ →** *Inspect roof & exterior seals*
- Condition slide seals — **⚙︎ →** *Condition slide-out seals*
- De-winterize water system — **⚙︎ →** *De-winterize water system*
- Sanitize fresh water — **⚙︎ →** *Sanitize fresh water system*
- Check tire pressure & tread — **⚙︎ →** *Check tire pressure & tread*
- Repack wheel bearings — **⚙︎ →** *Repack / inspect wheel bearings*
- Check brakes — **⚙︎ →** *Inspect & adjust brakes*
- Inspect suspension & wet bolts — **⚙︎ →** *Inspect suspension & grease wet bolts*
- Battery back in & charge — **⚙︎ →** *Battery service — charge & terminals*
- Test alarms — **⚙︎ →** *Test smoke / CO / LP alarms*
- Propane leak & pressure test — **⚙︎ →** *Propane system leak & pressure test*
- Service furnace — **⚙︎ →** *Service furnace*
- Service A/C coils — **⚙︎ →** *Service roof A/C coils*
- Service refrigerator — **⚙︎ →** *Service absorption refrigerator*
- Lubricate slide-out mechanism — **⚙︎ →** *Lubricate slide-out mechanism*
- Lubricate jacks & landing gear — **⚙︎ →** *Lubricate stabilizer jacks & landing gear*
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
- Inspect safety chains & breakaway cable
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
- Hitch up (coupler latched & locked, weight-distribution bars, sway control)
- Cross & inspect safety chains
- Test breakaway switch (battery holds, pin pulls, brakes engage)
- Re-torque lug nuts if a wheel was removed (recheck at 16 / 40 / 80 km)
- Connect & test lights (running / brake / turn)
- Walk-around: chocks removed, steps in, hatches closed, tow mirrors set
- Final tire-pressure glance
- Do a full lap of the site
- ✎ **Fresh water on board** (number, %)
- ✎ **Gray / black tank levels** (text)

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
- Flush water heater — **⚙︎ →** *Flush water heater*
- Check anode rod — **⚙︎ →** *Inspect water-heater anode rod*
- Bypass water heater
- Blow out water lines
- Pump RV antifreeze through all fixtures — **⚙︎ →** *Winterize water system*
- Antifreeze in all drain traps & toilet
- Deep-clean interior
- Remove all food
- Defrost & prop fridge open
- Remove batteries or put on tender — **⚙︎ →** *Battery service — charge & terminals*
- Inspect & touch up seals — **⚙︎ →** *Inspect roof & exterior seals*
- Set rodent deterrents
- Cover roof vents
- Remove valuables / electronics
- Cover or store rig
- Record tire pressure / chock
