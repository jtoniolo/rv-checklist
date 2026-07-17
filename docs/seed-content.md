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
