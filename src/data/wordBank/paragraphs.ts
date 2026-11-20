import type {ContentTheme, WordDifficultyTier} from '@/src/types/app';

export interface RawParagraphItem {
  text: string;
  tier: WordDifficultyTier;
  theme: ContentTheme;
}

export const BUNDLED_PARAGRAPHS: RawParagraphItem[] = [
  // School life (8)
  {
    tier: 1,
    theme: 'School life',
    text: 'The small red bell rang at nine sharp. Every boy and girl sat down at a neat wood desk and opened a clean book. Miss Lee wrote five short words on the dark board and asked the class to read them out loud together.',
  },
  {
    tier: 2,
    theme: 'School life',
    text: 'Every Friday afternoon, our class walks down to the quiet school library. Wooden tables sit beside tall windows that look out over the playing field. Students pick one story book for the weekend and write its title inside a small blue reading card.',
  },
  {
    tier: 3,
    theme: 'School life',
    text: 'Learning to touch type without looking down at the keys feels strange during the first week. Fingers hesitate above unfamiliar rows and mistakes happen often. Yet steady daily practice builds smooth muscle memory, letting thoughts flow straight onto the page without interruption.',
  },
  {
    tier: 3,
    theme: 'School life',
    text: 'In the biology classroom, bright glass jars lined the back counter alongside brass microscopes. Each pair of lab partners sketched onion cells onto squared paper and labelled the thin cell walls. Careful observation always came before drawing conclusions.',
  },
  {
    tier: 4,
    theme: 'School life',
    text: 'Debate club sessions taught students how to structure persuasive arguments with clear evidence and calm delivery. Instead of speaking louder than opponents, speakers learned to listen closely, note logical gaps, and respond directly to the strongest counterpoints raised across the floor.',
  },
  {
    tier: 4,
    theme: 'School life',
    text: 'During revision week, dividing study hours into focused thirty-minute blocks proved far more effective than marathon late-night cramming. Short breaks for fresh air and water kept concentration sharp, while brief self-testing exposed weak topics early enough to fix them.',
  },
  {
    tier: 5,
    theme: 'School life',
    text: 'Interdisciplinary humanities seminars encourage undergraduates to examine primary sources alongside quantitative historical records. By comparing personal diaries with municipal tax ledgers and shipping manifests, scholars uncover everyday patterns that grand political narratives routinely overlook.',
  },
  {
    tier: 2,
    theme: 'School life',
    text: 'Art class smelled faintly of cedar pencils and fresh poster paint. Across three long tables, pupils mixed yellow and blue into bright meadow greens. By the end of the hour, every drying rack held colourful landscapes ready for the hallway display.',
  },

  // Technology (8)
  {
    tier: 1,
    theme: 'Technology',
    text: 'Keep your wrists level and rest eight fingers lightly on the home row. Left hand sits on a, s, d, and f. Right hand sits on j, k, l, and the semicolon key. Press the space bar gently with your thumb after each short word.',
  },
  {
    tier: 2,
    theme: 'Technology',
    text: 'Good software works cleanly even when the network drops out on a train or in a quiet study room. Saving lessons and word lists directly inside browser storage means practice can begin in less than a second without waiting for remote servers.',
  },
  {
    tier: 3,
    theme: 'Technology',
    text: 'Early typewriters forced engineers to space common letter pairs apart so mechanical arms would not jam at high speeds. Although modern keyboards have no metal hammers to tangle, learning consistent finger zones still unlocks remarkable speed, accuracy, and comfort.',
  },
  {
    tier: 3,
    theme: 'Technology',
    text: 'Clean user interfaces respect attention by keeping controls predictable and text legible. Rather than crowding every corner with flashing badges, thoughtful designers leave generous breathing room around the active workspace so eyes stay locked on the task ahead.',
  },
  {
    tier: 4,
    theme: 'Technology',
    text: 'Progressive web applications combine fast local caching with installable desktop convenience. Once core scripts, stylesheets, and bundled fonts are stored by the service worker, launching the workspace feels instantaneous regardless of mobile signal strength.',
  },
  {
    tier: 4,
    theme: 'Technology',
    text: 'Measuring typing speed accurately requires tracking both raw character throughput and uncorrected mistakes. A typist racing at ninety words per minute with frequent errors spends extra time backspacing, whereas steady ninety-eight percent accuracy yields higher net speed.',
  },
  {
    tier: 5,
    theme: 'Technology',
    text: 'High-frequency input pipelines bypass unnecessary component re-renders by updating mutable telemetry buffers and animating cursor geometry strictly through hardware-composited transforms. Keeping per-keystroke latency below eight milliseconds preserves an unmistakably crisp mechanical feel.',
  },
  {
    tier: 2,
    theme: 'Technology',
    text: 'Automated backups quietly protect years of writing, photos, and personal notes. Setting a weekly reminder to verify that archives actually restore cleanly is just as vital as copying files in the first place.',
  },

  // Nature (8)
  {
    tier: 1,
    theme: 'Nature',
    text: 'At dawn the pale mist rose slowly off the still lake. Small ducks swam in a neat line past tall green reeds. Soon the warm sun climbed over the hill and turned every drop of dew on the grass into bright gold.',
  },
  {
    tier: 2,
    theme: 'Nature',
    text: 'Along the rocky coast, tide pools appear twice each day when ocean waters pull back from the shore. Careful visitors peering into the clear water often spot tiny darting shrimp, speckled crabs hiding under shells, and bright green seaweeds.',
  },
  {
    tier: 3,
    theme: 'Nature',
    text: 'Old-growth forests act like giant sponges during heavy autumn storms. Thick layers of moss, fallen needles, and tangled tree roots soak up rainfall slowly instead of letting muddy water rush straight down the hillside into nearby streams.',
  },
  {
    tier: 3,
    theme: 'Nature',
    text: 'Across high mountain meadows, summer arrives late and leaves early. Cushion plants hug the warm granite soil tightly to dodge freezing wind gusts, opening vivid blue and yellow blossoms within days of the final snowmelt.',
  },
  {
    tier: 4,
    theme: 'Nature',
    text: 'Coastal salt marshes rank among the most productive ecosystems on Earth despite their quiet appearance. Twice daily, incoming tides deliver dissolved nutrients while dense cordgrass roots trap fine sediment, creating sheltered nurseries for juvenile fish and wading birds.',
  },
  {
    tier: 4,
    theme: 'Nature',
    text: 'Long before compasses existed, Polynesian wayfinders crossed vast stretches of the Pacific Ocean by reading subtle swell patterns, bird flight paths at dusk, and rising star horizons. Nature supplied every instrument needed for thousand-mile voyages.',
  },
  {
    tier: 5,
    theme: 'Nature',
    text: 'Subsurface mycorrhizal networks form intricate symbiotic highways linking neighbouring forest trees underground. Through microscopic fungal filaments, mature canopy oaks transfer photosynthetic carbon sugars toward shaded seedlings while exchanging scarce phosphorus and moisture.',
  },
  {
    tier: 2,
    theme: 'Nature',
    text: 'After a dry July week, the first summer thunderstorm cooled the warm garden soil in minutes. Swallows swooped low across the wet lawn, catching insects stirred up by the fresh breeze while distant thunder faded eastward.',
  },

  // Business (8)
  {
    tier: 1,
    theme: 'Business',
    text: 'A good corner shop knows its regular buyers by name. Fresh milk, crisp loaves, and sweet fruit sit in neat rows near the front door. Fair prices and warm smiles bring people back week after week.',
  },
  {
    tier: 2,
    theme: 'Business',
    text: 'Writing clear, polite emails saves everyone time at work. Putting the main question in the first two lines helps busy teammates reply quickly without hunting through long paragraphs for missing dates or file links.',
  },
  {
    tier: 3,
    theme: 'Business',
    text: 'Small workshops succeed when craftspeople balance creative ambition with reliable daily habits. Tracking material costs honestly, communicating realistic delivery dates, and inspecting every finished order builds a reputation stronger than expensive advertising.',
  },
  {
    tier: 3,
    theme: 'Business',
    text: 'Well-run meetings start with a concise written agenda sent one day ahead. When participants read background notes beforehand, the group spends its shared half hour making crisp decisions rather than reading slides aloud.',
  },
  {
    tier: 4,
    theme: 'Business',
    text: 'Sustainable growth rarely comes from chasing every passing trend at once. Resilient companies identify one genuine customer bottleneck, build an unmistakably dependable solution, and refine operational details steadily quarter after quarter.',
  },
  {
    tier: 4,
    theme: 'Business',
    text: 'During project handovers, thorough documentation turns tribal knowledge into shared team capability. Recording architectural trade-offs, contact lists, and common troubleshooting steps prevents future teammates from repeating old mistakes.',
  },
  {
    tier: 5,
    theme: 'Business',
    text: 'Transparent financial stewardship requires evaluating capital commitments against conservative cash-flow projections rather than optimistic peak-cycle assumptions. Organisations that preserve disciplined operating margins weather unexpected macroeconomic headwinds without compromising product reliability.',
  },
  {
    tier: 2,
    theme: 'Business',
    text: 'Every Monday morning, the studio team gathers around a clean whiteboard for fifteen minutes. Each person shares top priorities for the week and flags any blocked tasks early so colleagues can step in and help.',
  },

  // Sports (8)
  {
    tier: 1,
    theme: 'Sports',
    text: 'Put on your clean track shoes and step out onto the grass. Jog two easy laps to warm your legs before the short race starts. Keep your eyes up, breathe deep, and swing your arms smooth and light.',
  },
  {
    tier: 2,
    theme: 'Sports',
    text: 'Saturday park runs welcome walkers, steady joggers, and speedy club racers side by side. Volunteers stand at every path turn cheering people on and handing out finish tokens regardless of how fast anyone crosses the line.',
  },
  {
    tier: 3,
    theme: 'Sports',
    text: 'Great relay teams spend hours practising silent baton passes inside a narrow twenty-metre zone. Because both runners move at full sprint, trust and crisp timing matter far more than raw individual speed alone.',
  },
  {
    tier: 3,
    theme: 'Sports',
    text: 'Just like touch typing, smooth swimming relies on relaxed technique rather than frantic force. When swimmers keep their head neutral and lengthen each stroke cleanly, they glide faster while using noticeably less oxygen.',
  },
  {
    tier: 4,
    theme: 'Sports',
    text: 'Long-distance cyclists understand that conserving energy early pays massive dividends on the final climb. Riding smoothly inside a sheltered paceline reduces wind resistance by nearly thirty percent until the decisive attack begins.',
  },
  {
    tier: 4,
    theme: 'Sports',
    text: 'In championship badminton, footwork recovers the court centre after every single shot. Players split-step lightly just as the opponent strikes the shuttle, turning sharp diagonal lunges into fluid, balanced defensive returns.',
  },
  {
    tier: 5,
    theme: 'Sports',
    text: 'Modern endurance coaching blends physiological threshold testing with disciplined psychological recovery rituals. Balancing high-intensity neuromuscular intervals against unhurried aerobic base mileage prevents overtraining injuries across demanding competitive calendars.',
  },
  {
    tier: 2,
    theme: 'Sports',
    text: 'Rain slicks the grass pitch and turns simple passes into fast sliding tests of control. Midfielders take smaller, sharper touches and keep passes crisp along the turf to protect possession under pressure.',
  },

  // Stories (8)
  {
    tier: 1,
    theme: 'Stories',
    text: 'Long ago, an old clock sat silent in the town square. One snowy night, a young girl climbed the stairs with a tiny brass key and a drop of clean oil. By dawn, sweet chimes woke the sleepy streets once more.',
  },
  {
    tier: 2,
    theme: 'Stories',
    text: 'In a narrow alley behind the harbour bookshop, Mister Finch mended worn maps and dusty globes. Sailors brought him torn paper charts soaked by sea spray, and he patched every crease until lost islands shone clearly again.',
  },
  {
    tier: 3,
    theme: 'Stories',
    text: 'From the top floor of the brick observatory, the winter stars looked close enough to touch. Every clear night, Nadia sketched constellations in white ink on dark paper, noting how Orion drifted slowly westward before sunrise.',
  },
  {
    tier: 3,
    theme: 'Stories',
    text: 'The express train slowed as it crossed the stone viaduct above the misty valley. Through the carriage window, passengers glimpsed glowing cottage kitchens, winding silver streams, and sheep grazing peacefully along steep green slopes.',
  },
  {
    tier: 4,
    theme: 'Stories',
    text: 'When the old lighthouse switched to an automated beacon, the keeper packed forty years of leather-bound weather logs into two wooden trunks. Every storm, fogbank, and passing schooner lived neatly inside his steady slanted ink.',
  },
  {
    tier: 4,
    theme: 'Stories',
    text: 'Hidden beneath three layers of nineteenth-century wallpaper, the carpenter discovered a painted mural of a bustling river port. Rather than sanding it away, the homeowners framed the rediscovered harbour right beside their dining table.',
  },
  {
    tier: 5,
    theme: 'Stories',
    text: 'Throughout the solitary Antarctic winter, the expedition meteorologist maintained meticulous barometer charts despite howling katabatic gales rattling the timber hut. Decades later, climate researchers still rely upon those frost-stained notebooks to calibrate historical pressure models.',
  },
  {
    tier: 2,
    theme: 'Stories',
    text: 'A stray ginger cat adopted the quiet railway station one crisp October morning. Stationmasters knitted him a small wool cushion beside the ticket stove, and commuters always paused to scratch behind his ears.',
  },

  // Science (8)
  {
    tier: 1,
    theme: 'Science',
    text: 'Air is all around us, even though we cannot see it. When you pump air into a bike tyre, tiny bits push hard against the rubber wall. That steady push lifts the bike smooth and firm off the ground.',
  },
  {
    tier: 2,
    theme: 'Science',
    text: 'Why do stars seem to twinkle on cold winter nights? Starlight travels across deep space in straight lines until it hits moving layers of warm and cool air above Earth, which bend the light slightly again and again.',
  },
  {
    tier: 3,
    theme: 'Science',
    text: 'Batteries store chemical energy and release it smoothly as a steady flow of electrons when a circuit closes. Inside modern lithium cells, tiny ions shuttle back and forth across a thin separator hundreds of times without losing strength.',
  },
  {
    tier: 3,
    theme: 'Science',
    text: 'Sound cannot travel through empty space because it needs atoms to bump against one another in waves. Inside steel rails or ocean water, where molecules sit much closer together, sound pulses race several times faster than through air.',
  },
  {
    tier: 4,
    theme: 'Science',
    text: 'Glass looks completely solid, yet light glides through it because silica atoms lack the tiny crystal grain boundaries that scatter rays inside opaque stones. Polishing lenses to sub-micron smoothness turns ordinary sand into precision telescopes.',
  },
  {
    tier: 4,
    theme: 'Science',
    text: 'Earth’s magnetic field acts as an invisible shield deflecting high-energy solar particles streaming outward from the Sun. Where charged particles funnel near polar latitudes, colliding upper-atmosphere gases glow emerald and violet as shimmering aurora curtains.',
  },
  {
    tier: 5,
    theme: 'Science',
    text: 'High-resolution cryo-electron microscopy freezes biological macromolecules inside vitreous ice fast enough to preserve native conformations without damaging crystal packing. Computational averaging of thousands of noisy projections reveals atomic-scale architectural mechanisms.',
  },
  {
    tier: 2,
    theme: 'Science',
    text: 'Compass needles always point north because molten iron churning deep inside Earth generates a planet-wide magnetic field. Hikers still carry pocket compasses as dependable backups whenever phone batteries run cold on mountain trails.',
  },

  // Everyday life (8)
  {
    tier: 1,
    theme: 'Everyday life',
    text: 'Morning light came softly through the pale curtain. Sam put the kettle on the stove, sliced two pieces of brown toast, and poured cold juice into a glass. Quiet mornings make the whole day feel calm and bright.',
  },
  {
    tier: 2,
    theme: 'Everyday life',
    text: 'Baking simple sourdough bread takes very few ingredients: flour, water, salt, and patient waiting. Mixing the dough takes only ten minutes, while gentle rising overnight develops crisp golden crusts and a tender, tangy crumb.',
  },
  {
    tier: 3,
    theme: 'Everyday life',
    text: 'Keeping a small notebook beside the kettle gives busy minds a quiet landing strip each morning. Jotting down three realistic priorities before checking messages prevents urgent distractions from crowding out meaningful work.',
  },
  {
    tier: 3,
    theme: 'Everyday life',
    text: 'Cycling short neighbourhood errands replaces traffic delays with fresh air and steady movement. Fitting a sturdy rear rack and waterproof pannier bag lets riders carry groceries home effortlessly without straining their shoulders.',
  },
  {
    tier: 4,
    theme: 'Everyday life',
    text: 'Well-tended cast iron cookware improves year after year instead of wearing out. Washing pans promptly with warm water, drying them thoroughly on a low burner, and rubbing in one thin drop of oil creates a lasting natural finish.',
  },
  {
    tier: 4,
    theme: 'Everyday life',
    text: 'Public libraries remain quiet civic treasures where anyone can borrow novels, repair guides, and quiet desk space free of charge. Stepping away from noisy algorithms into curated shelves sparks unexpected curiosity.',
  },
  {
    tier: 5,
    theme: 'Everyday life',
    text: 'Cultivating deliberate evening transitions between work responsibilities and household rest strengthens long-term cognitive clarity. Putting devices outside the bedroom, dimming warm lamps, and reading physical pages invites deeper restorative sleep.',
  },
  {
    tier: 2,
    theme: 'Everyday life',
    text: 'Sunday soup pots turn stray carrots, celery stalks, and herb stems into rich winter comfort. Simmering gently for an hour fills the entire kitchen with warm savoury steam while prepping easy lunches for Tuesday.',
  },
];
