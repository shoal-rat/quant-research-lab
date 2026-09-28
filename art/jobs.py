"""Art job definitions for Quant Research Lab v4 — 星轨学园 · 量化研究部.

Character bible lives in CAST; every prompt is assembled from it so all sheets
describe the same design with the same words.
"""

STYLE = (
    "Style: polished modern anime gacha-game official art (Blue Archive / Genshin Impact / "
    "Honkai Star Rail quality). Crisp clean lineart, cel shading with soft gradients, bright "
    "saturated but tasteful palette, big glossy detailed eyes with highlights, soft rim light, "
    "cute and appealing. No text, no watermark, no signature, no logo, no UI, no frame."
)

GREEN = (
    "Background: perfectly flat, uniform pure chroma-key green (#00FF00) everywhere behind the "
    "characters. No floor, no cast shadow on the background, no gradient, no vignette, no "
    "scenery. Keep every character fully inside the frame with a clear green margin around "
    "hair, hands and feet; nothing touches the image edge."
)

UNIFORM = (
    "Shared school uniform of Stellar Orbit Academy: white blazer with navy lapels and thin "
    "sky-blue piping, a small gold emblem of a star circled by an orbit ring on the left chest, "
    "navy pleated skirt (girls) or navy slacks (boys), a neck ribbon or tie in the character's "
    "personal accent color."
)

CAST = {
    "akari": dict(
        name="Hoshino Akari",
        role="hypothesis researcher, genki first-year idea girl",
        look=(
            "petite energetic girl; shoulder-length fluffy warm-orange hair with a big springy "
            "ahoge and a glowing yellow light-bulb hairpin clipping her side bangs; bright golden "
            "eyes; orange neck ribbon; blazer sleeves pushed up; a cream cardigan tied around her "
            "waist; white knee socks and orange sneakers; always carries a small notebook bristling "
            "with colorful sticky notes, pen tucked behind one ear"
        ),
        accent="warm orange",
    ),
    "shiori": dict(
        name="Shiraishi Shiori",
        role="data keeper, quiet deadpan kuudere",
        look=(
            "small girl; very long straight silver-lavender hair with a blunt hime cut, reaching "
            "her knees; half-lidded sleepy violet eyes; a small silver hourglass hair ornament and "
            "a thin purple bookmark ribbon in her hair; an oversized white lab coat worn over the "
            "uniform with sleeves so long they cover her hands; lavender neck ribbon; black tights "
            "and brown loafers; an antique silver pocket watch on a chain"
        ),
        accent="lavender",
    ),
    "ren": dict(
        name="Kujo Ren",
        role="backtest engineer, sleepy lazy-genius boy",
        look=(
            "slim teenage boy; messy black hair with an electric-blue inner-color streak; sleepy "
            "half-closed teal eyes with faint eye bags; a black hoodie with small cat ears on the "
            "hood worn under the unbuttoned uniform blazer; big white over-ear headphones around "
            "his neck; loose blue tie; navy slacks and black-and-white sneakers; often holding a "
            "blue energy-drink can and a sticker-covered laptop"
        ),
        accent="electric blue",
    ),
    "saki": dict(
        name="Himura Saki",
        role="risk officer, strict tsundere disciplinary-committee type",
        look=(
            "tall slender girl; long crimson-red hair in a high ponytail tied with a black ribbon; "
            "sharp ruby-red eyes behind thin red half-rim glasses; uniform worn perfectly buttoned "
            "with a red tie; a black armband with a gold shield emblem on her left arm; white "
            "gloves; black pantyhose and short black boots; carries a clipboard and a large red "
            "rubber stamp worn in a holster at her hip"
        ),
        accent="crimson red",
    ),
    "iori": dict(
        name="Kurobane Iori",
        role="statistics skeptic, dramatic chuunibyou boy",
        look=(
            "tall lanky teenage boy; black hair with long bangs covering his right eye, the visible "
            "left eye bright gold; a long black coat with gold trim draped over his shoulders like "
            "a cape on top of the uniform; black gloves; a small silver question-mark earring; gold "
            "tie; navy slacks and black shoes; carries a thick ornate black book with a gold sigma "
            "symbol on the cover"
        ),
        accent="gold",
    ),
    "mio": dict(
        name="Minazuki Mio",
        role="club president and portfolio manager, calm elegant third-year",
        look=(
            "graceful older girl; long aqua-teal hair gathered in a loose low side braid over her "
            "left shoulder, a silver water-drop hair clip; gentle blue-green eyes and a composed "
            "smile; uniform with a teal vest and a teal short capelet over the shoulders; teal "
            "ribbon with a small gold pin; navy pleated skirt, black thigh-high stockings, brown "
            "loafers; carries a leather-bound ledger and a gold fountain pen"
        ),
        accent="teal",
    ),
}

ORDER = ["akari", "shiori", "ren", "saki", "iori", "mio"]


def who(cid):
    c = CAST[cid]
    return f"{c['name']} ({c['role']}): {c['look']}"


JOBS = []

# ---- Stage 1: style anchor — the full cast lineup ----------------------------
JOBS.append(dict(
    id="lineup",
    out="lineup.png",
    prompt=f"""
Landscape image 1536x1024. An official character design lineup for an anime game: six ORIGINAL
teenage characters standing side by side in one row, full body head to toe, normal anime
proportions (about 7 heads tall), each in a relaxed signature pose, facing the viewer, evenly
spaced, same scale, not overlapping. Left to right:
1. {who('akari')}
2. {who('shiori')}
3. {who('ren')}
4. {who('saki')}
5. {who('iori')}
6. {who('mio')}
{UNIFORM}
{STYLE}
{GREEN}
""",
))

# ---- Stage 2: VN standing portraits (立绘) -----------------------------------
POSES = {
    "akari": "leaning forward energetically, one hand holding up her sticky-note notebook, the other "
             "raising an index finger in an 'I've got an idea!' gesture; big bright open-mouthed smile",
    "shiori": "standing small and straight, holding her antique pocket watch up in both sleeve-covered "
              "hands, head tilted slightly, calm deadpan half-lidded look",
    "ren": "relaxed slouch, one hand in the hoodie pocket, the other holding a blue energy-drink can, "
           "sticker laptop tucked under his arm, sleepy indifferent look",
    "saki": "standing tall with her clipboard hugged against her chest in crossed arms, one gloved hand "
            "adjusting her glasses, stern serious look",
    "iori": "dramatic pose: one gloved hand spread over half his face with the gold eye peeking between "
            "fingers, the other hand holding the sigma book open, coat flaring, confident smirk",
    "mio": "graceful posture, the leather ledger held against her chest, gold fountain pen in the other "
           "hand near her chin, gentle composed smile",
}

PORTRAIT_FRAME = (
    "Portrait orientation 1024x1536. A visual-novel standing character sprite (tachie) of ONE "
    "character, framed from the top of the head down to just above the knees (knee-up), centered, "
    "body facing the viewer at a slight three-quarter angle. The top of the head (including any "
    "ahoge) sits about 60px below the top edge. Same character design, outfit, colors and "
    "accessories as the attached reference; keep the design exactly."
)

for cid in ORDER:
    JOBS.append(dict(
        id=f"portrait-{cid}",
        out=f"portrait/{cid}-base.png",
        refs=[f"refs/{cid}.png"],
        prompt=f"""
{PORTRAIT_FRAME}
Character: {who(cid)}
{UNIFORM}
Pose and expression: {POSES[cid]}.
{STYLE}
{GREEN}
""",
    ))

EXPRESSIONS = {
    "joy": "overjoyed: eyes squeezed shut in happy upward arcs, wide open smiling mouth, light blush",
    "angry": "angry: furrowed eyebrows, sharp glare, teeth clenched or cheeks puffed in a pout",
    "shock": "shocked: eyes wide open with small pupils, mouth open in a small 'o', a bead of sweat",
    "sad": "sad: teary glistening eyes about to cry, eyebrows raised in the middle, wobbly mouth",
}
SPECIAL = {
    "akari": ("spark", "starry-eyed excitement: sparkling star highlights in her eyes, huge grin"),
    "shiori": ("fluster", "flustered: faint pink blush, eyes glancing away, tiny frown"),
    "ren": ("yawn", "sleepy: yawning with mouth open, one eye closed, a small tear at the corner"),
    "saki": ("tsun", "tsundere fluster: bright red cheeks, looking away to the side with a pout"),
    "iori": ("smug", "smug: dramatic sly smirk, visible eye narrowed and glinting, one eyebrow raised"),
    "mio": ("serious", "serious: cold commanding look, eyes narrowed, no smile, lips pressed"),
}

for cid in ORDER:
    exprs = dict(EXPRESSIONS)
    k, v = SPECIAL[cid]
    exprs[k] = v
    for ek, ev in exprs.items():
        JOBS.append(dict(
            id=f"expr-{cid}-{ek}",
            out=f"portrait/{cid}-{ek}.png",
            refs=[f"raw/portrait/{cid}-base.png"],
            prompt=f"""
Edit the attached image. Keep EVERYTHING identical: same character, same pose, same hands, same
outfit, same framing, same size and position in the frame, same colors, same lighting, and the same
flat pure green (#00FF00) background. Change ONLY the facial expression (eyes, eyebrows, mouth,
blush) to: {ev}. Output 1024x1536.
""",
        ))

# ---- Stage 3: chibi (SD, 2 heads tall) sprite sheets --------------------------
CHIBI = (
    "Super-deformed chibi version of the attached character: exactly TWO heads tall (the head is "
    "as big as the whole body), round soft proportions, stubby little arms and legs, big head and "
    "huge sparkly eyes, cute simplified outfit that keeps every signature design element (hair "
    "shape and color, accessories, uniform, props). Mobile gacha-game SD sprite style: clean bold "
    "outline, flat cel shading, bright colors."
)
GRID = (
    "Landscape 1536x1024 sprite sheet: a strict grid of 2 rows x 4 columns = 8 separate poses of "
    "the SAME chibi character, all drawn at the SAME scale, each centered in its own cell with wide "
    "empty green gaps between cells; nothing overlaps and nothing crosses a cell boundary. No "
    "text, no numbers, no grid lines, no symbols or effects floating around the characters."
)
SIGNATURE = {
    "akari": "jumping with one finger raised in an 'idea!' pose, notebook in the other hand",
    "shiori": "peering at her pocket watch through a big magnifying glass",
    "ren": "asleep face-down on his open laptop on the floor, curled up like a cat",
    "saki": "slamming her big red rubber stamp down onto a sheet of paper",
    "iori": "dramatic chuunibyou pose, hand over his face, coat flaring behind him",
    "mio": "elegantly sipping tea from a teacup held with its saucer",
}


def chibi_sheet(cid, cells):
    listing = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(cells))
    return f"""
{CHIBI}
Character: {who(cid)}
{GRID}
Cells, row by row, left to right:
{listing}
{STYLE}
{GREEN}
"""


for cid in ORDER:
    JOBS.append(dict(
        id=f"chibi-{cid}-a",
        out=f"chibi/{cid}-a.png",
        refs=[f"refs/{cid}.png"],
        prompt=chibi_sheet(cid, [
            "standing idle, facing the viewer, arms relaxed",
            "walking toward the viewer, left foot forward",
            "walking toward the viewer, right foot forward",
            "standing idle seen from behind (back view)",
            "walking away from the viewer (back view), left foot forward",
            "walking away from the viewer (back view), right foot forward",
            "walking to the LEFT in side profile, front leg forward",
            "walking to the LEFT in side profile, back leg forward (the other step)",
        ]),
    ))
    JOBS.append(dict(
        id=f"chibi-{cid}-b",
        out=f"chibi/{cid}-b.png",
        refs=[f"refs/{cid}.png", f"raw/chibi/{cid}-a.png"],
        prompt=chibi_sheet(cid, [
            "standing idle, facing the viewer (same as the reference chibi sheet)",
            "sitting on the floor typing on an open laptop on her/his lap, focused",
            "thinking with a hand on the chin, looking up",
            "writing notes on a clipboard or notebook",
            "presenting: pointing to the side with a long pointer stick",
            "drinking from a coffee mug held in both hands",
            "reading a sheet of paper held up close, concentrating",
            SIGNATURE[cid],
        ]) + "\nThe second attached image is this character's existing chibi sheet: match its chibi style and scale exactly.",
    ))
    JOBS.append(dict(
        id=f"chibi-{cid}-c",
        out=f"chibi/{cid}-c.png",
        refs=[f"refs/{cid}.png", f"raw/chibi/{cid}-a.png"],
        prompt=chibi_sheet(cid, [
            "standing idle, facing the viewer (same as the reference chibi sheet)",
            "joyful jump with both arms raised high, huge smile",
            "angry: stomping with clenched fists, puffed red cheeks",
            "crying: big comical tears streaming, rubbing eyes",
            "shocked: leaning back with wide eyes and open mouth",
            "embarrassed: blushing hard with both hands on cheeks, eyes shut happily (being head-patted)",
            "dizzy after being bonked on the head: swirly eyes, a little bump on the head, wobbling",
            "proud victory pose making a peace sign, winking",
        ]) + "\nThe second attached image is this character's existing chibi sheet: match its chibi style and scale exactly.",
    ))

# ---- Stage 4: backgrounds -------------------------------------------------------
BG_STYLE = (
    "Anime game background art, clean painterly rendering, soft cinematic lighting, rich detail, "
    "bright appealing colors, no people, no characters, no text, no logos, no UI."
)
JOBS += [
    dict(id="bg-clubroom", out="bg/clubroom.png", prompt=f"""
Landscape 1536x1024. A cute high-angle three-quarter top-down cutaway diorama view (like a mobile
game room/cafe screen) of a spacious school club room converted into a quantitative trading lab at
Stellar Orbit Academy. Walls on the back and left; the front and right are open to the viewer.
Furniture arranged ONLY along the back wall and the left wall, leaving a large open light-wood floor
area in the middle and the front for small characters to walk around:
- back wall, left part: a wall of six monitors showing colorful stock charts above a long desk;
- back wall, center: a big whiteboard covered in formulas and a hand-drawn equity curve;
- back wall, right part: a tall window with a blue-sky city skyline and a bookshelf of binders;
- left wall: a small server rack with blinking lights, then a coffee corner with espresso machine,
  mugs and snacks;
- front-left: a cozy sofa with cushions and a low table;
- center-right: a round meeting table with six chairs;
- three separate computer desks with dual monitors placed along the back half.
Warm afternoon sunlight through the window, potted plants, a cat-shaped cushion, sticky notes.
{BG_STYLE}
"""),
    dict(id="bg-vn-room", out="bg/vn-room.png", prompt=f"""
Landscape 1536x1024. Eye-level visual-novel background: interior of an anime school club room
turned into a quant research lab, seen from standing eye height: a big whiteboard with formulas and
charts on the left, a wall of monitors with stock charts in the center, a tall bright window with a
futuristic city skyline and blue sky on the right, desks with laptops and sticky notes, plants, warm
afternoon light. Slight depth of field. {BG_STYLE}
"""),
    dict(id="bg-vn-screens", out="bg/vn-screens.png", prompt=f"""
Landscape 1536x1024. Eye-level visual-novel background: a dark room at night dominated by a huge
curved wall of glowing screens showing candlestick charts, equity curves, heatmaps and order books
in cyan, blue and magenta light, reflections on a glossy floor, dramatic cinematic mood, city lights
through glass behind. {BG_STYLE}
"""),
    dict(id="bg-vn-council", out="bg/vn-council.png", prompt=f"""
Landscape 1536x1024. Eye-level visual-novel background: an elegant academy meeting room with a long
polished conference table, tall arched windows with late-afternoon golden light, a large wall screen
showing a portfolio pie chart, bookshelves, a gold star-and-orbit emblem banner on the wall (no
text). Serious but beautiful atmosphere. {BG_STYLE}
"""),
    dict(id="bg-vn-rooftop", out="bg/vn-rooftop.png", prompt=f"""
Landscape 1536x1024. Eye-level visual-novel background: a school rooftop at sunset with a chain-link
fence, a water tower, and a sweeping view of a futuristic coastal city with skyscrapers, a glowing
orange-pink sky with fluffy clouds and the first stars. Nostalgic anime mood. {BG_STYLE}
"""),
    dict(id="bg-title", out="bg/title.png", prompt=f"""
Landscape 1536x1024. Anime key-art background for a title screen: a gleaming futuristic academy
tower with a giant translucent orbit ring circling its top, set against a vivid blue summer sky
with towering white clouds, floating holographic stock-chart lines and star particles in the air,
cherry blossom petals, lens flare. Bright, hopeful, cinematic. {BG_STYLE}
"""),
    dict(id="keyvisual", out="bg/keyvisual.png", refs=["raw/lineup.png"], prompt=f"""
Landscape 1536x1024. Official anime game key visual: the six characters from the attached lineup
(same designs exactly) together in a dynamic group composition inside their bright quant-lab club
room with glowing chart screens and a big window with blue sky: the orange-haired girl in front
jumping with an 'idea' gesture, the red-haired girl with arms crossed, the teal-haired girl in the
center smiling calmly with her ledger, the black-haired boy with the cape in a dramatic pose, the
sleepy boy with headphones holding an energy drink, the small silver-lavender-haired girl holding
her pocket watch. Everyone's full face clearly visible, lively expressions, depth and sparkle.
Style: polished modern anime gacha-game key visual. No text, no logo.
"""),
]
