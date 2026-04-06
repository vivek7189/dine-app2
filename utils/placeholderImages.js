/**
 * Smart Placeholder Image System (React Native)
 * Maps menu item names/keywords to ~230 local placeholder images.
 *
 * Priority order in getDisplayImage():
 * 1. User-uploaded images (images[] array)
 * 2. User-uploaded image (legacy image string, non-Pexels)
 * 3. AI-suggested imageKeyword → local match
 * 4. Item name + category keyword match
 * 5. Pexels URL from backend (if any)
 * 6. Generic fallback
 */

// ─── Keyword → filename mapping ───
const KEYWORD_MAP = [
  // === Specific Thalis ===
  [['egg thali', 'egg-thali', 'dim thali'], 'egg-thali.jpg'],
  [['fish thali', 'fish-thali', 'machli thali', 'meen thali'], 'fish-thali.jpg'],
  [['chicken thali', 'chicken-thali', 'murgh thali'], 'chicken-thali.jpg'],
  [['mutton thali', 'mutton-thali', 'gosht thali', 'lamb thali'], 'mutton-thali.jpg'],
  [['veg thali', 'veg-thali', 'vegetarian thali', 'vegetable thali'], 'veg-thali.jpg'],
  [['paneer thali', 'paneer-thali'], 'paneer-thali.jpg'],
  [['special thali', 'spl thali', 'deluxe thali'], 'special-thali.jpg'],

  // === Specific Biryanis ===
  [['chicken biryani', 'chicken-biryani', 'murgh biryani'], 'chicken-biryani.jpg'],
  [['mutton biryani', 'mutton-biryani', 'gosht biryani', 'lamb biryani'], 'mutton-biryani.jpg'],
  [['egg biryani', 'egg-biryani', 'anda biryani', 'dim biryani'], 'egg-biryani.jpg'],
  [['veg biryani', 'veg-biryani', 'vegetable biryani', 'subz biryani'], 'veg-biryani.jpg'],
  [['fish biryani', 'fish-biryani', 'meen biryani'], 'fish-biryani.jpg'],
  [['prawn biryani', 'prawn-biryani', 'shrimp biryani', 'jhinga biryani'], 'prawn-biryani.jpg'],

  // === Specific Fried Rice ===
  [['chicken fried rice', 'chicken-fried-rice'], 'chicken-fried-rice.jpg'],
  [['egg fried rice', 'egg-fried-rice'], 'egg-fried-rice.jpg'],
  [['paneer fried rice', 'paneer-fried-rice', 'veg fried rice'], 'paneer-fried-rice.jpg'],
  [['chilli garlic rice', 'chilli-garlic-rice'], 'chilli-garlic-rice.jpg'],
  [['manchurian rice', 'manchurian-rice'], 'manchurian-rice.jpg'],

  // === Specific Noodles ===
  [['chicken noodles', 'chicken-noodles', 'chicken chow mein'], 'chicken-noodles.jpg'],
  [['egg noodles', 'egg-noodles', 'egg chow mein'], 'egg-noodles.jpg'],
  [['veg noodles', 'veg-noodles', 'vegetable noodles'], 'veg-noodles.jpg'],

  // === Specific Manchurian ===
  [['gobi manchurian', 'gobi-manchurian', 'cauliflower manchurian'], 'gobi-manchurian.jpg'],
  [['paneer manchurian', 'paneer-manchurian'], 'paneer-manchurian.jpg'],
  [['chicken manchurian', 'chicken-manchurian'], 'manchurian.jpeg'],

  // === Indian Main Course ===
  [['chicken 65', 'chicken-65'], 'chicken-65.jpg'],
  [['chicken lollipop', 'chicken-lollipop'], 'chicken-lollipop.jpg'],
  [['fish tikka', 'fish-tikka'], 'fish-tikka.jpg'],
  [['egg bhurji', 'egg-bhurji', 'anda bhurji'], 'egg-bhurji.jpg'],
  [['kadhai chicken', 'kadai chicken', 'karahi chicken'], 'chicken-curry.jpeg'],
  [['paneer tikka masala', 'paneer-tikka-masala'], 'paneer-tikka.jpeg'],
  [['butter paneer', 'butter-paneer'], 'paneer-curry.jpeg'],
  [['szechuan chicken', 'szechwan chicken'], 'szechuan-chicken.jpg'],
  [['crispy chicken', 'crispy-chicken'], 'fried-chicken.jpeg'],
  [['biryani', 'biriyani', 'briyani', 'biriani'], 'biryani.jpeg'],
  [['butter chicken', 'murgh makhani'], 'butter-chicken.jpeg'],
  [['tandoori chicken', 'tanduri chicken'], 'tandoori-chicken.jpeg'],
  [['chicken tikka'], 'chicken-tikka.jpeg'],
  [['chicken kosha', 'kosha chicken'], 'chicken-kosha.jpeg'],
  [['chicken do pyaza', 'do pyaza'], 'chicken-do-pyaza.jpeg'],
  [['chicken curry', 'chicken gravy', 'chicken masala'], 'chicken-curry.jpeg'],
  [['chicken chaap', 'chaap'], 'chicken-curry.jpeg'],
  [['mutton kosha', 'kosha mutton', 'kosha mangsho'], 'mutton-kosha.jpeg'],
  [['mutton curry', 'mutton gravy', 'lamb curry', 'gosht', 'goat curry', 'mutton masala', 'rogan josh', 'mangsho'], 'mutton-curry.jpeg'],
  [['fish kalia', 'katla fish', 'katla kalia', 'rohu fish', 'rohu kalia'], 'fish-kalia.jpeg'],
  [['prawn malai', 'malai curry prawn', 'chingri malai', 'galda prawn', 'prawn malaikari'], 'prawn-malai.jpeg'],
  [['ilish', 'hilsa', 'sorshe ilish', 'shorshe ilish'], 'ilish.jpeg'],
  [['fish curry', 'machli curry', 'meen curry', 'machher jhol'], 'fish-curry.jpeg'],
  [['egg curry', 'anda curry', 'egg masala', 'dim curry', 'dim kosha'], 'egg-curry.jpeg'],
  [['chole bhature', 'chhole bhature'], 'chole-bhature.jpeg'],
  [['chole', 'chana masala', 'chickpea', 'chhole'], 'chole.jpeg'],
  [['rajma chawal', 'rajma rice'], 'rajma-chawal.jpeg'],
  [['rajma', 'kidney bean'], 'rajma.jpeg'],
  [['palak paneer', 'saag paneer', 'spinach paneer'], 'palak-paneer.jpeg'],
  [['malai kofta'], 'malai-kofta.jpeg'],
  [['kadhi pakora', 'kadhi'], 'kadhi-pakora.jpeg'],
  [['aloo gobi', 'gobi aloo', 'cauliflower potato'], 'aloo-gobi.jpeg'],
  [['aloo matar', 'matar aloo', 'peas potato'], 'aloo-matar.jpeg'],
  [['mixed veg', 'mix veg', 'sabzi', 'subzi'], 'mixed-veg.jpeg'],
  [['korma', 'qorma'], 'korma.jpeg'],
  [['dal tadka', 'tadka dal', 'yellow dal'], 'dal-tadka.jpeg'],
  [['dal chawal', 'dal rice', 'dal khichdi'], 'dal-chawal.jpeg'],
  [['chana dal', 'chana daal'], 'chana-dal.jpeg'],
  [['kadhai paneer', 'kadai paneer', 'karahi'], 'kadhai.jpeg'],
  [['shahi paneer'], 'shahi-paneer.jpeg'],
  [['paneer butter masala', 'paneer makhani'], 'paneer-butter-masala.jpeg'],
  [['methi malai', 'methi paneer', 'methi matar'], 'methi-malai.jpeg'],
  [['paneer tikka'], 'paneer-tikka.jpeg'],
  [['chilli paneer', 'chilly paneer'], 'chilli-paneer.jpeg'],
  [['paneer 65', 'paneer fry'], 'paneer-65.jpeg'],
  [['paneer butter', 'paneer curry', 'paneer masala', 'paneer gravy', 'matar paneer', 'paneer bhurji'], 'paneer-curry.jpeg'],
  [['dal makhani', 'dal makhni', 'daal makhani', 'daal makhni', 'black dal'], 'daal-makhni.jpg'],
  [['dal', 'daal', 'lentil'], 'daal-makhni.jpg'],
  [['pav bhaji', 'bhaji'], 'bhaji.jpeg'],
  [['vada pav', 'vada pao'], 'vada-pav.jpeg'],
  [['baingan', 'eggplant', 'brinjal', 'baigan', 'begun'], 'baingan.jpeg'],
  [['bhindi', 'okra', 'lady finger', 'bhendi'], 'bhindi.jpeg'],
  [['lauki', 'bottle gourd', 'ghiya', 'dudhi'], 'lauki.jpeg'],
  [['mushroom curry', 'mushroom masala'], 'mushroom-curry.jpeg'],
  [['kofta curry', 'veg kofta'], 'kofta-curry.jpeg'],
  [['stuffed capsicum', 'bharwa shimla mirch'], 'stuffed-capsicum.jpeg'],
  [['baby corn'], 'baby-corn.jpeg'],
  [['thali'], 'thali.jpeg'],

  // === Bengali ===
  [['mughlai paratha', 'mughlai'], 'mughlai-paratha.jpeg'],
  [['fish batter fry', 'batter fry', 'bhetki fry'], 'fish-batter-fry.jpeg'],
  [['diamond fish fry', 'diamond fry'], 'fish-fry.jpeg'],
  [['kochuri', 'koraishutir kochuri', 'radhaballabhi'], 'kochuri.jpeg'],
  [['sandesh', 'sondesh'], 'sandesh.jpeg'],
  [['mishti doi', 'misti doi', 'sweet curd', 'mishti dohi'], 'mishti-doi.jpeg'],
  [['payesh', 'payasam'], 'payesh.jpeg'],
  [['cham cham', 'chamcham'], 'cham-cham.jpeg'],
  [['rasgulla', 'rosogolla', 'rasgolla'], 'rasgulla.jpeg'],

  // === South Indian ===
  [['ghee roast masala dosa', 'ghee masala dosa'], 'ghee-dosa.jpg'],
  [['ghee roast dosa', 'ghee roast', 'ghee rava dosa'], 'ghee-dosa.jpg'],
  [['ghee podi dosa', 'ghee podi'], 'podi-dosa.jpg'],
  [['paper roast masala dosa'], 'paper-roast-dosa.jpg'],
  [['paper roast dosa', 'paper roast', 'paper dosa'], 'paper-roast-dosa.jpg'],
  [['podi onion dosa', 'podi onion uthappam', 'podi uthappam', 'podi uttapam'], 'podi-dosa.jpg'],
  [['podi dosa', 'podi idly', 'ghee podi idly', 'ghee podi'], 'podi-dosa.jpg'],
  [['onion rava masala dosa', 'onion rava dosa'], 'dosa.jpeg'],
  [['onion dosa', 'onion uthappam', 'onion uttapam', 'onion pesarattu'], 'dosa.jpeg'],
  [['rava masala dosa'], 'dosa.jpeg'],
  [['masala dosa'], 'dosa.jpeg'],
  [['rava dosa', 'ghee rava dosa', 'ghee ravva dosa'], 'dosa.jpeg'],
  [['rava kichidi', 'rava kichadi'], 'khichdi.jpeg'],
  [['ragi dosa', 'kambu dosa', 'millet dosa'], 'dosa.jpeg'],
  [['butter dosa', 'carrot dosa'], 'dosa.jpeg'],
  [['dosa', 'mysore dosa', 'set dosa', 'plain dosa'], 'dosa.jpeg'],
  [['sambar idli', 'sambar idly', 'ghee sambar idli', 'ghee sambar idly'], 'sambar-idli.jpg'],
  [['ghee podi idli', 'ghee podi idly', 'podi idli'], 'idli.jpeg'],
  [['mini idli', 'mini idly'], 'mini-idli.jpg'],
  [['idli', 'idly'], 'idli.jpeg'],
  [['idiyappam', 'string hopper', 'nool puttu'], 'idiyappam.jpg'],
  [['sambar vada', 'sambhar vada'], 'sambar-vada.jpg'],
  [['medu vada'], 'medu-vada.jpg'],
  [['curd vada'], 'curd-vada.jpg'],
  [['vada curry', 'vadacurry'], 'vadacurry.jpg'],
  [['vada', 'wada'], 'vada.jpeg'],
  [['uttapam', 'uthappam'], 'uttapam.jpeg'],
  [['upma pesarattu'], 'pesarattu.jpeg'],
  [['upma', 'uppma'], 'upma.jpeg'],
  [['appam', 'hoppers'], 'appam.jpeg'],
  [['ven pongal', 'pongal'], 'pongal.jpeg'],
  [['rasam'], 'rasam.jpeg'],
  [['sambhar', 'sambar'], 'sambhar.jpeg'],
  [['pesarattu'], 'pesarattu.jpeg'],
  [['south indian thali'], 'south-indian-thali.jpg'],
  [['north indian meal', 'north indian thali'], 'thali.jpeg'],
  [['mini tiffin', 'spl mini tiffin', 'tiffin'], 'mini-tiffin.jpg'],
  [['parota', 'parotta', 'kerala parotta', 'malabar parotta'], 'parotta.jpg'],
  [['chapathi', 'chapati'], 'chapathi.jpg'],
  [['chola poori', 'chola puri', 'chole poori'], 'chole-bhature.jpg'],

  // === Chinese / Indo-Chinese ===
  [['hakka noodles', 'chowmein', 'chow mein'], 'noodles.jpeg'],
  [['schezwan noodles', 'szechuan noodles'], 'schezwan-noodles.jpeg'],
  [['chilli garlic noodles'], 'chilli-garlic-noodles.jpeg'],
  [['noodles'], 'noodles.jpeg'],
  [['fried rice'], 'fried-rice.jpeg'],
  [['manchurian'], 'manchurian.jpeg'],
  [['spring roll'], 'spring-rolls.jpeg'],
  [['chilli chicken', 'chilly chicken'], 'chilli-chicken.jpeg'],
  [['dragon chicken'], 'dragon-chicken.jpeg'],
  [['honey chilli', 'honey chilly'], 'honey-chilli.jpeg'],
  [['american chopsuey', 'chop suey'], 'american-chopsuey.jpeg'],
  [['sweet corn soup', 'corn soup'], 'sweet-corn-soup.jpeg'],
  [['hot and sour', 'hot sour soup'], 'hot-sour-soup.jpeg'],
  [['manchow soup'], 'manchow-soup.jpeg'],
  [['dim sum', 'dumpling'], 'dim-sum.jpeg'],
  [['sweet sour', 'sweet and sour'], 'sweet-sour.jpeg'],
  [['crispy vegetable', 'crispy veg'], 'crispy-vegetables.jpeg'],
  [['chinese platter'], 'chinese-platter.jpeg'],

  // === Snacks / Starters ===
  [['samosa'], 'samosa.jpeg'],
  [['pakora', 'pakoda', 'bhajiya', 'bhajia'], 'pakora.jpeg'],
  [['bread pakora'], 'bread-pakora.jpeg'],
  [['tandoori momos', 'fried momos'], 'tandoori-momos.jpeg'],
  [['momos', 'momo'], 'momos.jpeg'],
  [['chaat', 'papdi chaat', 'dahi bhalla'], 'chaat.jpeg'],
  [['sev puri'], 'sev-puri.jpeg'],
  [['dahi vada', 'dahi bhalla'], 'dahi-vada.jpeg'],
  [['pani puri', 'gol gappa', 'golgappa', 'puchka', 'phuchka'], 'pani-puri.jpeg'],
  [['tikki', 'aloo tikki', 'cutlet'], 'tikki.jpeg'],
  [['veg cutlet'], 'veg-cutlet.jpeg'],
  [['aloo chop', 'potato chop'], 'aloo-chop.jpeg'],
  [['seekh kebab', 'seekh kabab'], 'seekh-kebab.jpeg'],
  [['kebab', 'kabab', 'shami'], 'kebab.jpg'],
  [['chicken wings', 'buffalo wings', 'wings'], 'chicken-wings.jpeg'],
  [['chicken pokora', 'chicken pakora'], 'pakora.jpeg'],
  [['mushroom'], 'mushroom.jpeg'],
  [['soya chaap', 'chaap'], 'soya-chaap.jpeg'],
  [['crispy corn', 'masala corn'], 'crispy-corn.jpeg'],
  [['corn'], 'corn.jpeg'],
  [['onion ring'], 'onion-ring.jpeg'],
  [['fish finger'], 'fish-finger.jpeg'],
  [['dhokla'], 'dhokla.jpeg'],
  [['khandvi'], 'khandvi.jpeg'],
  [['dabeli'], 'dabeli.jpeg'],
  [['paneer pakora', 'paneer-pakora'], 'paneer-pakora.jpg'],
  [['onion pakora', 'onion-pakora', 'pyaaz pakora'], 'onion-pakora.jpg'],
  [['aloo bonda', 'aloo-bonda', 'potato bonda', 'bonda'], 'aloo-bonda.jpg'],
  [['masala peanut', 'masala-peanut', 'spicy peanut'], 'masala-peanut.jpg'],
  [['papdi chaat', 'papdi-chaat'], 'papdi-chaat.jpg'],
  [['ragda pattice', 'ragda-pattice', 'ragda patties'], 'ragda-pattice.jpg'],
  [['kachori'], 'kachori.jpg'],
  [['mirchi bajji', 'mirchi-bajji', 'mirchi pakora', 'chilli bajji'], 'mirchi-bajji.jpg'],
  [['gobi 65', 'gobi-65', 'cauliflower 65'], 'gobi-65.jpg'],
  [['paneer popcorn', 'paneer-popcorn'], 'paneer-popcorn.jpg'],
  [['mushroom 65', 'mushroom-65'], 'mushroom-65.jpg'],
  [['tandoori platter', 'sizzler', 'mixed platter', 'non veg platter'], 'tandoori-platter.jpeg'],
  [['salt pepper'], 'salt-pepper.jpeg'],

  // === Rolls / Wraps ===
  [['egg roll', 'anda roll'], 'egg-roll.jpeg'],
  [['chicken roll', 'chicken kathi'], 'chicken-roll.jpeg'],
  [['mutton roll'], 'wrap.jpeg'],
  [['paneer roll'], 'paneer-roll.jpeg'],
  [['fish roll'], 'wrap.jpeg'],

  // === Rice ===
  [['jeera rice', 'cumin rice', 'zeera rice'], 'jeera-rice.jpeg'],
  [['pulao', 'pilaf', 'pulav', 'veg pulao', 'basanti pulao'], 'pulao.jpeg'],
  [['lemon rice'], 'lemon-rice.jpeg'],
  [['curd rice'], 'curd-rice.jpeg'],
  [['khichdi', 'khichri'], 'khichdi.jpeg'],
  [['plain rice', 'steamed rice', 'bhaat'], 'plain-rice.jpeg'],

  // === Breads ===
  [['cheese naan', 'cheese-naan'], 'garlic-naan.jpeg'],
  [['keema naan', 'keema-naan'], 'keema-naan.jpg'],
  [['plain naan', 'plain-naan'], 'butter-naan.jpeg'],
  [['garlic naan'], 'garlic-naan.jpeg'],
  [['aloo paratha', 'aloo-paratha'], 'stuffed-paratha.jpeg'],
  [['gobi paratha', 'gobi-paratha'], 'stuffed-paratha.jpeg'],
  [['paneer paratha', 'paneer-paratha'], 'paneer-paratha.jpg'],
  [['egg paratha', 'egg-paratha', 'anda paratha'], 'stuffed-paratha.jpeg'],
  [['tandoori paratha', 'tandoori-paratha'], 'laccha-paratha.jpeg'],
  [['stuffed paratha'], 'stuffed-paratha.jpeg'],
  [['lachha paratha', 'laccha paratha', 'lachha'], 'laccha-paratha.jpeg'],
  [['rumali roti', 'roomali'], 'rumali-roti.jpeg'],
  [['kulcha', 'amritsari'], 'kulcha.jpeg'],
  [['puri', 'poori'], 'puri.jpeg'],
  [['tandoori roti'], 'tandoori-roti.jpeg'],
  [['butter naan'], 'butter-naan.jpeg'],
  [['missi roti'], 'missi-roti.jpeg'],
  [['naan', 'roti', 'paratha', 'chapati', 'bhatura', 'pao'], 'indian-bread.jpeg'],

  // === Sides & Soups ===
  [['raita', 'boondi raita', 'cucumber raita'], 'raita.jpeg'],
  [['salad', 'caesar', 'greek salad'], 'salad.jpeg'],
  [['chutney', 'mint chutney', 'pudina chutney'], 'chutney.jpeg'],
  [['pickle', 'achaar', 'achar'], 'pickle.jpeg'],
  [['papad', 'papadum', 'poppadom'], 'papad.jpeg'],
  [['dal shorba', 'dal soup'], 'dal-soup.jpeg'],
  [['manchow soup'], 'manchow-soup.jpeg'],
  [['cream of mushroom', 'cream soup'], 'cream-soup.jpeg'],
  [['soup', 'shorba', 'tomato soup', 'broth'], 'soup.jpeg'],

  // === Specific Sandwiches ===
  [['chicken sandwich', 'chicken-sandwich'], 'sandwich.jpeg'],
  [['veg sandwich', 'veg-sandwich', 'vegetable sandwich'], 'sandwich.jpeg'],
  [['paneer sandwich', 'paneer-sandwich'], 'paneer-sandwich.jpg'],
  [['club sandwich', 'club-sandwich'], 'sandwich.jpeg'],
  [['cheese sandwich', 'cheese-sandwich', 'grilled cheese'], 'sandwich.jpeg'],

  // === Specific Burgers ===
  [['veg burger', 'veg-burger', 'veggie burger'], 'burgers.jpeg'],
  [['chicken burger', 'chicken-burger'], 'burgers.jpeg'],
  [['cheese burger', 'cheese-burger', 'cheeseburger'], 'burgers.jpeg'],

  // === Specific Chutneys ===
  [['green chutney', 'green-chutney', 'mint chutney', 'pudina chutney'], 'chutney.jpeg'],
  [['tomato chutney', 'tomato-chutney', 'red chutney'], 'chutney.jpeg'],
  [['coconut chutney', 'coconut-chutney'], 'chutney.jpeg'],
  [['onion salad', 'onion-salad'], 'salad.jpeg'],

  // === Pizza & Italian ===
  [['pizza', 'margherita', 'pepperoni pizza'], 'pizza.jpeg'],
  [['garlic bread'], 'garlic-bread.jpeg'],
  [['white sauce pasta', 'alfredo'], 'white-pasta.jpeg'],
  [['red sauce pasta', 'arrabbiata'], 'red-pasta.jpeg'],
  [['pasta', 'spaghetti', 'macaroni', 'penne'], 'pasta.jpeg'],
  [['lasagna', 'lasagne'], 'lasagna.jpeg'],
  [['risotto'], 'risotto.jpeg'],
  [['bruschetta'], 'bruschetta.jpeg'],
  [['calzone'], 'calzone.jpeg'],
  [['mac cheese', 'mac and cheese'], 'mac-cheese.jpeg'],

  // === Fast Food ===
  [['burger', 'hamburger'], 'burgers.jpeg'],
  [['sandwich', 'grilled sandwich', 'panini'], 'sandwich.jpeg'],
  [['wrap', 'tortilla', 'burrito', 'shawarma', 'kathi roll', 'frankie'], 'wrap.jpeg'],
  [['french fries', 'fries', 'finger chips'], 'fries.jpeg'],
  [['loaded fries', 'poutine'], 'loaded-fries.jpeg'],
  [['tacos', 'taco'], 'tacos.jpeg'],
  [['nachos'], 'nachos.jpeg'],
  [['quesadilla'], 'quesadilla.jpeg'],
  [['fried chicken', 'chicken popcorn', 'chicken nuggets', 'chicken strip'], 'fried-chicken.jpeg'],
  [['nuggets'], 'nuggets.jpeg'],
  [['grilled chicken', 'chicken breast'], 'grilled-chicken.jpeg'],
  [['steak', 'beef steak', 'tenderloin'], 'steak.jpeg'],
  [['sausage'], 'sausage.jpeg'],
  [['hot dog', 'hotdog'], 'hot-dog.jpeg'],

  // === Seafood ===
  [['fish fry', 'fried fish'], 'fish-fry.jpeg'],
  [['fish chips', 'fish and chips'], 'fish-chips.jpeg'],
  [['prawn fry', 'fried prawn'], 'prawn-fry.jpeg'],
  [['prawn', 'shrimp', 'jhinga', 'kolambi', 'chingri'], 'prawns.jpeg'],
  [['grilled fish', 'baked fish', 'fish steak'], 'grilled-fish.jpeg'],
  [['calamari', 'squid'], 'calamari.jpeg'],
  [['crab', 'lobster'], 'crab.jpeg'],
  [['fish'], 'fish-fry.jpeg'],

  // === Hot Beverages ===
  [['masala chai', 'adrak chai', 'ginger tea'], 'tea.jpeg'],
  [['filter coffee', 'south indian coffee'], 'filter-coffee.jpeg'],
  [['cappuccino'], 'cappuccino.jpeg'],
  [['espresso', 'americano'], 'black-coffee.jpeg'],
  [['latte'], 'coffee.jpeg'],
  [['green tea', 'herbal tea'], 'green-tea.jpeg'],
  [['hot chocolate', 'hot cocoa'], 'hot-chocolate.jpeg'],
  [['boost', 'horlicks', 'bournvita', 'malt drink'], 'boost-malt.jpg'],
  [['milk', 'hot milk', 'badam milk', 'haldi milk', 'turmeric milk'], 'milk.jpg'],
  [['chai', 'tea'], 'tea.jpeg'],
  [['coffee'], 'coffee.jpeg'],

  // === Cold Beverages ===
  [['chocolate shake', 'chocolate-shake', 'chocolate milkshake'], 'chocolate-shake.jpg'],
  [['strawberry shake', 'strawberry-shake', 'strawberry milkshake'], 'strawberry-shake.jpg'],
  [['banana shake', 'banana-shake', 'banana milkshake'], 'banana-shake.jpg'],
  [['oreo shake', 'oreo-shake', 'oreo milkshake', 'cookies shake'], 'oreo-shake.jpg'],
  [['green smoothie', 'green-smoothie', 'kale smoothie'], 'green-smoothie.jpg'],
  [['fruit punch', 'fruit-punch'], 'fruit-punch.jpg'],
  [['blue lagoon', 'blue-lagoon', 'blue curacao'], 'blue-lagoon.jpg'],
  [['mint lemonade', 'mint-lemonade', 'mint lime'], 'mint-lemonade.jpg'],
  [['sweet lime soda', 'sweet-lime-soda', 'lime soda'], 'sweet-lime-soda.jpg'],
  [['orange juice', 'orange-juice'], 'orange-juice.jpg'],
  [['pomegranate juice', 'pomegranate-juice', 'anaar juice'], 'pomegranate-juice.jpg'],
  [['pineapple juice', 'pineapple-juice'], 'pineapple-juice.jpg'],
  [['tender coconut', 'tender-coconut'], 'tender-coconut.jpg'],
  [['badam milk', 'badam-milk', 'almond milk', 'kesar milk'], 'badam-milk.jpg'],
  [['mango lassi'], 'lassi.jpeg'],
  [['lassi', 'sweet lassi', 'salted lassi'], 'lassi.jpeg'],
  [['mango shake', 'mango smoothie'], 'mango-shake.jpeg'],
  [['watermelon juice'], 'watermelon-juice.jpeg'],
  [['sugarcane juice'], 'sugarcane-juice.jpeg'],
  [['fresh juice', 'orange juice', 'fruit juice', 'apple juice'], 'fresh-juice.jpeg'],
  [['smoothie', 'shake'], 'smoothie.jpeg'],
  [['virgin mojito'], 'mojito.jpeg'],
  [['mojito'], 'mojito.jpeg'],
  [['cold coffee', 'iced coffee', 'cold brew', 'frappe'], 'cold-coffee.jpeg'],
  [['lemonade', 'nimbu pani', 'shikanji', 'lime soda'], 'lemonade.jpeg'],
  [['milkshake'], 'milkshake.jpeg'],
  [['buttermilk', 'chaas', 'chaach', 'mattha'], 'buttermilk.jpeg'],
  [['coconut water', 'nariyal pani', 'tender coconut'], 'coconut-water.jpeg'],
  [['iced tea'], 'iced-tea.jpeg'],
  [['thandai'], 'thandai.jpeg'],
  [['jaljeera', 'jal jeera'], 'jaljeera.jpeg'],
  [['rose sharbat', 'rooh afza', 'sharbat'], 'rose-sharbat.jpeg'],
  [['kokum'], 'kokum.jpeg'],
  [['soda', 'soft drink', 'cola', 'coke', 'pepsi', 'sprite', 'fanta', 'thumbs up', 'limca'], 'soda.jpeg'],

  // === Alcohol ===
  [['craft beer', 'ipa', 'wheat beer'], 'craft-beer.jpeg'],
  [['beer', 'lager', 'ale', 'stout', 'draft', 'draught', 'pint', 'kingfisher', 'budweiser', 'heineken', 'corona', 'bira', 'carlsberg', 'tuborg'], 'beer.jpeg'],
  [['margarita'], 'margarita.jpeg'],
  [['old fashioned'], 'old-fashioned.jpeg'],
  [['long island', 'liit'], 'long-island.jpeg'],
  [['martini'], 'martini.jpeg'],
  [['pina colada', 'pinacolada'], 'pina-colada.jpeg'],
  [['daiquiri'], 'daiquiri.jpeg'],
  [['cocktail', 'cosmopolitan', 'manhattan', 'negroni'], 'cocktail.jpeg'],
  [['champagne', 'prosecco', 'sparkling wine'], 'champagne.jpeg'],
  [['sangria'], 'sangria.jpeg'],
  [['wine', 'red wine', 'white wine', 'rose wine', 'merlot', 'cabernet', 'chardonnay', 'pinot', 'shiraz'], 'wine.jpeg'],
  [['whiskey', 'whisky', 'scotch', 'bourbon', 'jack daniels', 'johnnie walker', 'jameson', 'glenfiddich'], 'whiskey.jpeg'],
  [['vodka', 'absolut', 'grey goose', 'smirnoff'], 'vodka.jpeg'],
  [['rum', 'bacardi', 'old monk', 'captain morgan'], 'rum.jpeg'],
  [['gin', 'bombay sapphire', 'hendrick', 'tanqueray', 'gin tonic'], 'gin.jpeg'],
  [['tequila', 'patron', 'jose cuervo'], 'tequila.jpeg'],

  // === Specific Desserts ===
  [['gajar halwa', 'gajar-halwa', 'carrot halwa'], 'gajar-halwa.jpg'],
  [['moong dal halwa', 'moong-dal-halwa'], 'halwa.jpeg'],
  [['gulab jamun ice cream', 'gulab-jamun-icecream'], 'gulab-jamun-icecream.jpg'],
  [['shahi tukda', 'shahi-tukda', 'shahi tukra'], 'pudding.jpeg'],
  [['double ka meetha', 'double-ka-meetha'], 'pudding.jpeg'],
  [['fruit custard', 'fruit-custard'], 'pudding.jpeg'],
  [['fruit salad', 'fruit-salad', 'fresh fruit'], 'salad.jpeg'],
  [['falooda', 'falooda-icecream'], 'falooda.jpg'],

  // === Specific Ice Cream ===
  [['vanilla ice cream', 'vanilla-icecream', 'vanilla icecream'], 'vanilla-icecream.jpg'],
  [['chocolate ice cream', 'chocolate-icecream', 'chocolate icecream'], 'chocolate-icecream.jpg'],
  [['strawberry ice cream', 'strawberry-icecream', 'strawberry icecream'], 'strawberry-icecream.jpg'],
  [['mango ice cream', 'mango-icecream', 'mango icecream'], 'mango-icecream.jpg'],
  [['butterscotch ice cream', 'butterscotch-icecream', 'butterscotch icecream'], 'butterscotch-icecream.jpg'],
  [['ice cream sundae', 'icecream-sundae', 'sundae'], 'icecream-sundae.jpg'],
  [['banana split', 'banana-split'], 'banana-split.jpg'],
  [['frozen yogurt', 'frozen-yogurt', 'froyo'], 'frozen-yogurt.jpg'],

  // === Specific Cakes ===
  [['chocolate cake', 'chocolate-cake'], 'chocolate-cake.jpg'],
  [['red velvet cake', 'red-velvet-cake', 'red velvet'], 'red-velvet-cake.jpg'],
  [['black forest cake', 'black-forest-cake', 'black forest'], 'black-forest-cake.jpg'],
  [['fruit cake', 'fruit-cake', 'mixed fruit cake'], 'fruit-cake.jpg'],
  [['pineapple cake', 'pineapple-cake'], 'pineapple-cake.jpg'],
  [['vanilla cake', 'vanilla-cake'], 'vanilla-cake.jpg'],

  // === Indian Desserts ===
  [['gulab jamun', 'gulabjamun'], 'gulab-jamun.jpeg'],
  [['rasmalai', 'ras malai'], 'rasmalai.jpeg'],
  [['kheer', 'rice pudding'], 'kheer.jpeg'],
  [['phirni'], 'phirni.jpeg'],
  [['jalebi'], 'jalebi.jpeg'],
  [['imarti'], 'imarti.jpeg'],
  [['malpua'], 'malpua.jpeg'],
  [['halwa', 'gajar halwa', 'suji halwa', 'moong dal halwa', 'carrot halwa'], 'halwa.jpeg'],
  [['rabri', 'rabdi'], 'rabri.jpeg'],
  [['kulfi'], 'kulfi.jpeg'],
  [['rasgulla', 'rosogolla', 'rasgolla'], 'rasgulla.jpeg'],
  [['ladoo', 'laddu', 'laddoo', 'motichoor'], 'ladoo.jpeg'],
  [['barfi', 'burfi', 'kaju katli', 'kaju barfi'], 'barfi.jpeg'],
  [['sandesh', 'sondesh'], 'sandesh.jpeg'],
  [['mishti doi', 'misti doi', 'sweet curd'], 'mishti-doi.jpeg'],
  [['payesh', 'payasam'], 'payesh.jpeg'],
  [['cham cham', 'chamcham'], 'cham-cham.jpeg'],
  [['soan papdi'], 'soan-papdi.jpeg'],
  [['peda'], 'peda.jpeg'],

  // === Western Desserts ===
  [['cheesecake'], 'cheesecake.jpeg'],
  [['creme brulee'], 'creme-brulee.jpeg'],
  [['fruit tart'], 'fruit-tart.jpeg'],
  [['pudding', 'custard', 'caramel pudding', 'flan'], 'pudding.jpeg'],
  [['cookie', 'cookies', 'biscuit'], 'cookie.jpeg'],
  [['muffin'], 'muffin.jpeg'],
  [['donut', 'doughnut'], 'donut.jpeg'],
  [['waffle'], 'waffle.jpeg'],
  [['tiramisu'], 'tiramisu.jpeg'],
  [['brownie', 'chocolate brownie'], 'brownie.jpeg'],
  [['mousse', 'chocolate mousse'], 'mousse.jpeg'],
  [['panna cotta'], 'panna-cotta.jpeg'],
  [['ice cream', 'icecream', 'sundae', 'gelato'], 'icecream.jpeg'],
  [['chocolate', 'chocolate cake', 'choco'], 'chocolate.jpeg'],
  [['cake slice', 'cake'], 'cake-slice.jpeg'],
  [['cupcake'], 'cupcake.jpeg'],
  [['pastry'], 'pastry.jpeg'],
  [['croissant'], 'croissant.jpeg'],

  // === Bakery ===
  [['eclair', 'chocolate eclair'], 'eclair.jpg'],
  [['macaron', 'macaroon'], 'macaron.jpg'],
  [['swiss roll', 'swiss-roll'], 'swiss-roll.jpg'],
  [['cheese puff', 'cheese-puff'], 'cheese-puff.jpg'],
  [['veg puff', 'veg-puff', 'vegetable puff'], 'veg-puff.jpg'],
  [['chicken puff', 'chicken-puff'], 'chicken-puff.jpg'],
  [['rusk'], 'rusk.jpg'],
  [['biscotti'], 'biscotti.jpg'],
  [['bread butter', 'bread-butter', 'bread and butter'], 'bread-butter.jpg'],
  [['cinnamon roll'], 'cinnamon-roll.jpeg'],
  [['bread loaf', 'bread'], 'bread-loaf.jpeg'],
  [['puff', 'puff pastry', 'patties'], 'puff.jpeg'],
  [['focaccia'], 'focaccia.jpeg'],
  [['bagel'], 'bagel.jpeg'],
  [['scone'], 'scone.jpeg'],
  [['bun', 'dinner roll', 'roll'], 'bun.jpeg'],

  // === Breakfast ===
  [['eggs benedict'], 'eggs-benedict.jpeg'],
  [['french toast'], 'french-toast.jpeg'],
  [['omelette', 'omelet', 'egg omelette'], 'omelette.jpeg'],
  [['scrambled egg', 'boiled egg', 'fried egg'], 'eggs.jpeg'],
  [['hash brown'], 'hash-brown.jpeg'],
  [['toast'], 'toast.jpeg'],
  [['pancake'], 'pancake.jpeg'],
  [['poha', 'flattened rice'], 'poha.jpeg'],
  [['cereal', 'muesli', 'granola', 'oats', 'porridge'], 'cereal.jpeg'],
  [['egg'], 'eggs.jpeg'],

  // === Combos ===
  [['combo meal', 'combo'], 'combo-meal.jpeg'],
  [['non veg platter', 'mixed grill'], 'non-veg-platter.jpeg'],
  [['snack platter'], 'snack-platter.jpeg'],

  // === Misc ===
  [['potato', 'aloo'], 'potato-dish.jpg'],
];

// Build flat lookup sorted by keyword length (longest first)
const _keywordIndex = [];
for (const [keywords, filename] of KEYWORD_MAP) {
  if (!filename) continue;
  const kws = Array.isArray(keywords) ? keywords : [keywords];
  for (const kw of kws) {
    _keywordIndex.push([kw.toLowerCase(), filename]);
  }
}
_keywordIndex.sort((a, b) => b[0].length - a[0].length);

function matchKeywords(text) {
  if (!text) return null;
  for (const [kw, filename] of _keywordIndex) {
    if (text.includes(kw)) return filename;
  }
  return null;
}

const CATEGORY_FALLBACKS = {
  'chinese': 'chinese-platter.jpeg', 'indo-chinese': 'chinese-platter.jpeg',
  'appetizer': 'appetizer.jpeg', 'starter': 'appetizer.jpeg', 'snack': 'samosa.jpeg',
  'main course': 'paneer-curry.jpeg', 'curry': 'paneer-curry.jpeg', 'gravy': 'paneer-curry.jpeg',
  'bread': 'indian-bread.jpeg', 'roti': 'indian-bread.jpeg', 'naan': 'indian-bread.jpeg',
  'dal': 'daal-makhni.jpg', 'lentil': 'daal-makhni.jpg',
  'rice': 'jeera-rice.jpeg', 'biryani': 'biryani.jpeg',
  'south indian': 'dosa.jpeg', 'dosa': 'dosa.jpeg', 'dosa varieties': 'dosa.jpeg',
  'healthy dosa': 'dosa.jpeg', 'favourites': 'mini-tiffin.jpg', 'favourite': 'mini-tiffin.jpg',
  'meals': 'south-indian-thali.jpg', 'break fast': 'idli.jpeg',
  'hot beverages': 'tea.jpeg', 'hot beverage': 'tea.jpeg',
  'bengali': 'fish-kalia.jpeg',
  'dessert': 'gulab-jamun.jpeg', 'sweet': 'gulab-jamun.jpeg', 'mithai': 'gulab-jamun.jpeg',
  'beverage': 'fresh-juice.jpeg', 'drink': 'fresh-juice.jpeg', 'juice': 'fresh-juice.jpeg',
  'mocktail': 'mojito.jpeg', 'cocktail': 'cocktail.jpeg',
  'beer': 'beer.jpeg', 'wine': 'wine.jpeg', 'whiskey': 'whiskey.jpeg',
  'vodka': 'vodka.jpeg', 'rum': 'rum.jpeg', 'gin': 'gin.jpeg',
  'burger': 'burgers.jpeg', 'fast food': 'burgers.jpeg',
  'pizza': 'pizza.jpeg', 'pasta': 'pasta.jpeg', 'italian': 'pasta.jpeg',
  'seafood': 'prawns.jpeg', 'fish': 'fish-fry.jpeg',
  'bakery': 'puff.jpeg', 'breakfast': 'omelette.jpeg',
  'soup': 'soup.jpeg', 'salad': 'salad.jpeg',
  'tandoor': 'tandoori-platter.jpeg', 'kebab': 'kebab.jpg',
  'momos': 'momos.jpeg', 'chaat': 'chaat.jpeg', 'thali': 'thali.jpeg',
  'roll': 'wrap.jpeg', 'wrap': 'wrap.jpeg',
  'combo': 'combo-meal.jpeg', 'platter': 'snack-platter.jpeg',
};

function getPlaceholderImageName(itemName, category, isVeg, imageKeyword) {
  const name = (itemName || '').toLowerCase().trim();
  const cat = (category || '').toLowerCase().trim();
  const kw = (imageKeyword || '').toLowerCase().trim();

  if (kw) { const m = matchKeywords(kw); if (m) return m; }
  if (name) { const m = matchKeywords(name); if (m) return m; }
  if (cat) {
    for (const [catKey, filename] of Object.entries(CATEGORY_FALLBACKS)) {
      if (cat.includes(catKey)) return filename;
    }
  }
  return null;
}

function getDisplayImage(menuItem, baseUrl = 'https://dineopen.com') {
  if (menuItem.images && Array.isArray(menuItem.images) && menuItem.images.length > 0) {
    const firstImage = menuItem.images[0];
    if (firstImage && firstImage.url) return firstImage.url;
  }

  if (menuItem.image && typeof menuItem.image === 'string' && menuItem.image.trim() !== '') {
    if (!menuItem.image.includes('pexels.com')) return menuItem.image;
  }

  const placeholderName = getPlaceholderImageName(menuItem.name, menuItem.category, menuItem.isVeg, menuItem.imageKeyword);
  if (placeholderName) return `${baseUrl}/placeholder-images/${placeholderName}`;

  if (menuItem.image && typeof menuItem.image === 'string' && menuItem.image.trim() !== '') {
    return menuItem.image;
  }

  return `${baseUrl}/placeholder-images/appetizer.jpeg`;
}

module.exports = { getDisplayImage, getPlaceholderImageName, hasLocalPlaceholder: (n, c, k) => getPlaceholderImageName(n, c, false, k) !== null };
