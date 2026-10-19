const rows = [
  ['Sign out', 'ውጣ', 'Ba’i', 'ውፃእ'],
  ['AfroLife home', 'የAfroLife መነሻ', 'Fuula jalqabaa AfroLife', 'መበገሲ ገጽ AfroLife'],
  ['More', 'ተጨማሪ', 'Dabalata', 'ተወሳኺ'],
  ['More workspace sections', 'ተጨማሪ የሥራ ቦታ ክፍሎች', 'Kutaa hojii dabalataa', 'ተወሳኺ ክፍልታት ቦታ ስራሕ'],
  ['YOUR WORKSPACE', 'የእርስዎ የሥራ ቦታ', 'IDDOO HOJII KEESSAN', 'ቦታ ስራሕኩም'],
  ['All sections', 'ሁሉም ክፍሎች', 'Kutaa hunda', 'ኩሎም ክፍልታት'],
  ['Close', 'ዝጋ', 'Cufi', 'ዕጸው'],
  ['Close workspace sections', 'የሥራ ቦታ ክፍሎችን ዝጋ', 'Kutaa hojii cufi', 'ክፍልታት ቦታ ስራሕ ዕጸው'],
  ['PEOPLE · SERVICES · OPPORTUNITY', 'ሰዎች · አገልግሎቶች · ዕድል', 'Namoota · Tajaajila · Carraa', 'ሰባት · ኣገልግሎታት · ዕድል'],
  ['One trusted place to get work moving.', 'ሥራን ለማስኬድ አንድ የታመነ ቦታ።', 'Bakka amanamaa hojii itti jalqabsiisan.', 'ስራሕ ንምንቅስቓስ ሓደ ዝተኣመነ ቦታ።'],
  ['Coordinate leads, verified workers and service requests with clear ownership at every step.', 'ደንበኞችን፣ የተረጋገጡ ሠራተኞችን እና የአገልግሎት ጥያቄዎችን በእያንዳንዱ ደረጃ ግልጽ ኃላፊነት ባለው መንገድ ያስተባብሩ።', 'Maamiltoota, hojjettoota mirkanaa’an fi gaaffii tajaajilaa tarkaanfii hunda irratti itti gaafatamummaa ifa ta’een qindeessaa.', 'Ma’amilaat፣ ዝተረጋገጹ ሰራሕተኛታትን ሕቶታት ኣገልግሎትን ኣብ ነፍሲ ወከፍ ደረጃ ግልጺ ሓላፍነት ብዘለዎ መንገዲ ኣወሃህዱ።'],
  ['Verified workforce', 'የተረጋገጠ የሠራተኛ ኃይል', 'Hojjettoota mirkanaa’an', 'ዝተረጋገጸ ሓይሊ ሰራሕተኛ'],
  ['Accountable agent network', 'ተጠያቂነት ያለው የወኪሎች መረብ', 'Neetworkii bakka bu’oota itti gaafatamummaa qabu', 'ተሓታትነት ዘለዎ መርበብ ወከልቲ'],
  ['Central matching oversight', 'ማዕከላዊ የማዛመድ ቁጥጥር', 'To’annoo walitti fiduu giddugaleessaa', 'ማእከላዊ ቁጽጽር ምዝማድ'],
  ['SECURE WORKSPACE', 'ደህንነቱ የተጠበቀ የሥራ ቦታ', 'Iddoo hojii nageenya qabu', 'ውሑስ ቦታ ስራሕ'],
  ['Welcome back', 'እንኳን ደህና መጡ', 'Baga nagaan deebiitan', 'እንቋዕ ብደሓን ተመለስኩም'],
  ['Sign in with your registered Ethiopian phone number.', 'በተመዘገበው የኢትዮጵያ ስልክ ቁጥርዎ ይግቡ።', 'Lakkoofsa bilbilaa Itoophiyaa galmeessitan fayyadamuun seenaa.', 'ብዝተመዝገበ ቁጽሪ ስልኪ ኢትዮጵያ እቶ።'],
  ['Phone number', 'ስልክ ቁጥር', 'Lakkoofsa bilbilaa', 'ቁጽሪ ስልኪ'],
  ['Password', 'የይለፍ ቃል', 'Jecha icciitii', 'መሕለፊ ቃል'],
  ['Authenticator code', 'የማረጋገጫ ኮድ', 'Koodii mirkaneessaa', 'ኮድ መረጋገጺ'],
  ['Sign in', 'ግባ', 'Seeni', 'እቶ'],
  ['Access is limited to approved AfroLife accounts.', 'መዳረሻው ለተፈቀዱ የAfroLife መለያዎች ብቻ ነው።', 'Seensaan herrega AfroLife hayyamame qofaaf daangeffama.', 'መእተዊ ንዝተፈቕደሎም ሕሳባት AfroLife ጥራይ ዝተወሰነ እዩ።'],
  ['API server address', 'የAPI አገልጋይ አድራሻ', 'Teessoo sarvarii API', 'ኣድራሻ ሰርቨር API'],
  ['Save server address', 'የአገልጋይ አድራሻ አስቀምጥ', 'Teessoo sarvarii olkaa’i', 'ኣድራሻ ሰርቨር ዓቅብ'],
  ['Change server', 'አገልጋይ ቀይር', 'Sarvarii jijjiiri', 'ሰርቨር ቀይር'],
  ['ETHIOLIFE OPERATIONS', 'የETHIOLIFE ሥራ አስተዳደር', 'HOJII ETHIOLIFE', 'ስራሕ ETHIOLIFE'],
  ['Your workspace', 'የእርስዎ የሥራ ቦታ', 'Iddoo hojii keessan', 'ቦታ ስራሕኩም'],
  ['Refresh', 'አድስ', 'Haaromsi', 'ኣሐድስ'],
  ['Workspace sections', 'የሥራ ቦታ ክፍሎች', 'Kutaa iddoo hojii', 'ክፍልታት ቦታ ስራሕ'],
  ['Overview', 'አጠቃላይ እይታ', 'Cuunfaa', 'ሓፈሻዊ ርእይቶ'],
  ['Leads', 'ደንበኞች', 'Maamiltoota', 'መራሕቲ'],
  ['Workers', 'ሠራተኞች', 'Hojjettoota', 'ሰራሕተኛታት'],
  ['Requests & matching', 'ጥያቄዎች እና ማዛመድ', 'Gaaffii fi walitti fiduu', 'ሕቶታትን ምዝማድን'],
  ['Security', 'ደህንነት', 'Nageenya', 'ድሕነት'],
  ['Admin & review', 'አስተዳደር እና ግምገማ', 'Bulchiinsa fi gamaaggama', 'ምምሕዳርን ግምገማን'],
  ['Secure operations · Addis Ababa, Ethiopia', 'ደህንነቱ የተጠበቀ ሥራ · አዲስ አበባ፣ ኢትዮጵያ', 'Hojii nageenya qabu · Finfinnee, Itoophiyaa', 'ውሑስ ስራሕ · ኣዲስ ኣበባ፣ ኢትዮጵያ'],
  ['Your activity', 'የእርስዎ እንቅስቃሴ', 'Sochii keessan', 'ንጥፈታትኩም'],
  ['Your latest records and work in progress.', 'የቅርብ ጊዜ መዝገቦችዎ እና በሂደት ላይ ያሉ ሥራዎች።', 'Galmeewwan dhiheenyaa fi hojii adeemsarra jiru.', 'ናይ ቀረባ ግዜ መዝገባትኩምን ኣብ ምክያድ ዘሎ ስራሕን።'],
  ['No activity yet. Start by registering a lead or worker.', 'እስካሁን ምንም እንቅስቃሴ የለም። ደንበኛ ወይም ሠራተኛ በመመዝገብ ይጀምሩ።', 'Ammaaf sochiin hin jiru. Maamila yookaan hojjetaa galmeessuun jalqabaa.', 'ክሳብ ሕጂ ንጥፈት የለን። ዓሚል ወይ ሰራሕተኛ ብምምዝጋብ ጀምሩ።'],
  ['Lead book', 'የደንበኞች መዝገብ', 'Galmee maamiltootaa', 'መዝገብ መራሕቲ'],
  ['Every opportunity stays attributed to the agent who sourced it.', 'እያንዳንዱ ዕድል ያመጣው ወኪል ጋር ተያይዞ ይቆያል።', 'Carraan hundi bakka bu’aa isa fideetti galmaa’a.', 'ነፍሲ ወከፍ ዕድል ምስቲ ዘምጽኦ ወኪል ተተሓሒዙ ይቕመጥ።'],
  ['Add a lead', 'ደንበኛ ጨምር', 'Maamila dabali', 'መራሒ ወስኽ'],
  ['Lead type', 'የደንበኛ ዓይነት', 'Gosa maamilaa', 'ዓይነት መራሒ'],
  ['Household', 'ቤተሰብ', 'Maatii', 'ስድራቤት'],
  ['Business', 'ንግድ', 'Daldala', 'ንግዲ'],
  ['Worker', 'ሠራተኛ', 'Hojjetaa', 'ሰራሕተኛ'],
  ['Property', 'ንብረት', 'Qabeenya', 'ንብረት'],
  ['Name', 'ስም', 'Maqaa', 'ስም'],
  ['Save lead', 'ደንበኛን አስቀምጥ', 'Maamila olkaa’i', 'መራሒ ዓቅብ'],
  ['Leads you create will appear here.', 'የፈጠሯቸው ደንበኞች እዚህ ይታያሉ።', 'Maamiltoonni galmeessitan asitti mul’atu.', 'ዝፈጠርኩሞም መራሕቲ ኣብዚ ክርአዩ እዮም።'],
  ['Worker directory', 'የሠራተኞች ዝርዝር', 'Tarree hojjettootaa', 'ዝርዝር ሰራሕተኛታት'],
  ['Register potential workers. Compliance must verify required documents before matching.', 'ሊሠሩ የሚችሉ ሠራተኞችን ይመዝግቡ። ከማዛመድ በፊት የሚፈለጉ ሰነዶች በተገዢነት ቡድን መረጋገጥ አለባቸው።', 'Hojjettoota hojii danda’an galmeessaa. Walitti fiduu dura sanadoonni barbaachisan kutaa to’annoo seeraa mirkanaa’uu qabu.', 'ሊሰርሑ ዝኽእሉ ሰራሕተኛታት መዝግቡ። ቅድሚ ምዝማድ ዝድለዩ ሰነዳት ብክፍሊ ተገዢነት ክረጋገጹ ኣለዎም።'],
  ['Add a worker', 'ሠራተኛ ጨምር', 'Hojjetaa dabali', 'ሰራሕተኛ ወስኽ'],
  ['Full name', 'ሙሉ ስም', 'Maqaa guutuu', 'ምሉእ ስም'],
  ['Service sector', 'የአገልግሎት ዘርፍ', 'Kutaa tajaajilaa', 'ዘርፊ ኣገልግሎት'],
  ['Expected monthly rate (ETB)', 'የሚጠበቀው ወርሃዊ ክፍያ (ብር)', 'Gatii ji’aa eegamu (ETB)', 'ዝጽበ ወርሓዊ ዋጋ (ETB)'],
  ['Experience (years)', 'የሥራ ልምድ (ዓመታት)', 'Muuxannoo (waggoota)', 'ተመኩሮ (ዓመታት)'],
  ['Choose an area', 'አካባቢ ይምረጡ', 'Naannoo filadhaa', 'ከባቢ ምረጹ'],
  ['Skills (comma-separated)', 'ክህሎቶች (በኮማ ይለዩ)', 'Dandeettii (komaadhaan addaan baasi)', 'ክእለታት (ብኮማ ፍለዩ)'],
  ['Languages (comma-separated)', 'ቋንቋዎች (በኮማ ይለዩ)', 'Afaanota (komaadhaan addaan baasi)', 'ቋንቋታት (ብኮማ ፍለዩ)'],
  ['Register worker', 'ሠራተኛን መዝግብ', 'Hojjetaa galmeessi', 'ሰራሕተኛ መዝግብ'],
  ['Workers you register will appear here.', 'የሚመዘግቧቸው ሠራተኞች እዚህ ይታያሉ።', 'Hojjettoonni galmeessitan asitti mul’atu.', 'ዝመዝግብኩሞም ሰራሕተኛታት ኣብዚ ክርአዩ እዮም።'],
  ['Upload documents', 'ሰነዶችን ጫን', 'Sanadoota olkaa’i', 'ሰነዳት ስቐል'],
  ['Documents', 'ሰነዶች', 'Sanadoota', 'ሰነዳት'],
  ['Verify worker', 'ሠራተኛን አረጋግጥ', 'Hojjetaa mirkaneessi', 'ሰራሕተኛ ኣረጋግጽ'],
  ['Service requests & matching', 'የአገልግሎት ጥያቄዎች እና ማዛመድ', 'Gaaffii tajaajilaa fi walitti fiduu', 'ሕቶታት ኣገልግሎትን ምዝማድን'],
  ['Agents create demand; Super Admin reviews eligible, verified candidates and controls match decisions.', 'ወኪሎች ጥያቄ ያቀርባሉ፤ ሱፐር አስተዳዳሪው ብቁና የተረጋገጡ እጩዎችን ይመረምራል እና የማዛመድ ውሳኔዎችን ይቆጣጠራል።', 'Bakka bu’oonni fedhii uumu; bulchaan olaanaan kaadhimamtoota ulaagaa guutan fi mirkanaa’an gamaaggamee murtii walitti fiduu to’ata.', 'ወከልቲ ፍላጎት ይፈጥሩ፤ ሱፐር ኣስተዳዳሪ ብቑዓትን ዝተረጋገጹን ሕጹያት ይግምግምን ውሳነ ምዝማድ ይቆጻጸርን።'],
  ['Create a request', 'ጥያቄ ፍጠር', 'Gaaffii uumi', 'ሕቶ ፍጠር'],
  ['Customer lead', 'የደንበኛ መዝገብ', 'Galmee maamilaa', 'መዝገብ ዓሚል'],
  ['Choose a household or business lead', 'የቤተሰብ ወይም የንግድ ደንበኛ ይምረጡ', 'Maamila maatii yookaan daldalaa filadhaa', 'መራሒ ስድራቤት ወይ ንግዲ ምረጹ'],
  ['Skills to match', 'የሚዛመዱ ክህሎቶች', 'Dandeettii walitti fidamu', 'ዝዛመዱ ክእለታት'],
  ['Languages to match', 'የሚዛመዱ ቋንቋዎች', 'Afaanota walitti fidaman', 'ዝዛመዱ ቋንቋታት'],
  ['Minimum experience (years)', 'ዝቅተኛ የሥራ ልምድ (ዓመታት)', 'Muuxannoo xiqqaa (waggoota)', 'ዝተሓተ ተመኩሮ (ዓመታት)'],
  ['Monthly budget (ETB)', 'ወርሃዊ በጀት (ብር)', 'Baajata ji’aa (ETB)', 'ወርሓዊ ባጀት (ETB)'],
  ['Create request', 'ጥያቄ ፍጠር', 'Gaaffii uumi', 'ሕቶ ፍጠር'],
  ['No service requests yet.', 'እስካሁን የአገልግሎት ጥያቄ የለም።', 'Ammaaf gaaffiin tajaajilaa hin jiru.', 'ክሳብ ሕጂ ሕቶ ኣገልግሎት የለን።'],
  ['Find candidates', 'እጩዎችን ፈልግ', 'Kaadhimamtoota barbaadi', 'ሕጹያት ድለ'],
  ['Matches', 'ማዛመዶች', 'Walitti fiduu', 'ምዝማዳት'],
  ['Administration', 'አስተዳደር', 'Bulchiinsa', 'ምምሕዳር'],
  ['Compliance review', 'የተገዢነት ግምገማ', 'Gamaaggama to’annoo seeraa', 'ግምገማ ተገዢነት'],
  ['Provision accounts and review the operational summary.', 'መለያዎችን ይፍጠሩ እና የሥራ ማጠቃለያውን ይገምግሙ።', 'Herrega uumaa cuunfaa hojii gamaaggamaa.', 'ሕሳባት ፍጠሩን ጽማቕ ስራሕ ገምግሙን።'],
  ['Review account verification before activation.', 'ከማንቃት በፊት የመለያ ማረጋገጫን ይገምግሙ።', 'Akkaawuntii hojii irra oolchuu dura mirkaneessa isaa gamaaggamaa.', 'ቅድሚ ምንቃሕ ምርግጋጽ ሕሳብ ገምግሙ።'],
  ['Legal name', 'ሕጋዊ ሙሉ ስም', 'Maqaa seera qabeessa', 'ሕጋዊ ምሉእ ስም'],
  ['Role', 'ሚና', 'Gahee', 'ግደ'],
  ['Master agent', 'ዋና ወኪል', 'Bakka bu’aa olaanaa', 'ዋና ወኪል'],
  ['Field agent', 'የመስክ ወኪል', 'Bakka bu’aa dirree', 'ወኪል መስክ'],
  ['Compliance', 'ተገዢነት', 'To’annoo seeraa', 'ተገዢነት'],
  ['Finance', 'ፋይናንስ', 'Faayinaansii', 'ፋይናንስ'],
  ['Finance manager', 'የፋይናንስ አስተዳዳሪ', 'Bulchaa faayinaansii', 'ኣማሓዳሪ ፋይናንስ'],
  ['Customer', 'ደንበኛ', 'Maamila', 'ዓሚል'],
  ['Property owner', 'የንብረት ባለቤት', 'Abbaa qabeenyaa', 'ባዓል ንብረት'],
  ['No territory', 'ክልል የለም', 'Naannoo hin qabu', 'ከባቢ የለን'],
  ['Master agent (required for field agents)', 'ዋና ወኪል (ለመስክ ወኪሎች ያስፈልጋል)', 'Bakka bu’aa olaanaa (bakka bu’oota dirreef dirqama)', 'ዋና ወኪል (ንወከልቲ መስክ የድሊ)'],
  ['Choose master agent', 'ዋና ወኪል ይምረጡ', 'Bakka bu’aa olaanaa filadhaa', 'ዋና ወኪል ምረጹ'],
  ['Email', 'ኢሜይል', 'Imeelii', 'ኢመይል'],
  ['Create account', 'መለያ ፍጠር', 'Herrega uumi', 'ሕሳብ ፍጠር'],
  ['No accounts to display.', 'የሚታይ መለያ የለም።', 'Herregni agarsiisu hin jiru.', 'ዝርአ ሕሳብ የለን።'],
  ['Verify KYC', 'KYC አረጋግጥ', 'KYC mirkaneessi', 'KYC ኣረጋግጽ'],
  ['Reject', 'ውድቅ አድርግ', 'Didi', 'ነጽግ'],
  ['Activate', 'አንቃ', 'Hojii irra oolchi', 'ኣንቅሕ'],
  ['Deactivate', 'አቦዝን', 'Hojii dhaabi', 'ኣቦዝን'],
  ['Platform snapshot', 'የመድረኩ አጭር ማጠቃለያ', 'Cuunfaa waltajjii', 'ሓጺር ርእይቶ መድረኽ'],
  ['Set a new password', 'አዲስ የይለፍ ቃል ያዘጋጁ', 'Jecha icciitii haaraa qopheessaa', 'ሓድሽ መሕለፊ ቃል ኣዳሉ'],
  ['Your account requires a password change before continuing.', 'ከመቀጠልዎ በፊት የይለፍ ቃልዎን መቀየር ያስፈልጋል።', 'Itti fufuu dura jecha icciitii jijjiiruu qabdu.', 'ቅድሚ ምቕጻልኩም መሕለፊ ቃልኩም ክትቅይሩ ኣለኩም።'],
  ['Temporary password', 'ጊዜያዊ የይለፍ ቃል', 'Jecha icciitii yeroo', 'ግዝያዊ መሕለፊ ቃል'],
  ['New password (12+ characters)', 'አዲስ የይለፍ ቃል (12+ ቁምፊዎች)', 'Jecha icciitii haaraa (qubee 12+)', 'ሓድሽ መሕለፊ ቃል (12+ ፊደላት)'],
  ['Update password', 'የይለፍ ቃል አዘምን', 'Jechoota icciitii haaromsi', 'መሕለፊ ቃል ኣሐድስ'],
  ['Account security', 'የመለያ ደህንነት', 'Nageenya herregaa', 'ድሕነት ሕሳብ'],
  ['Protect your account with an authenticator app.', 'በማረጋገጫ መተግበሪያ መለያዎን ይጠብቁ።', 'Appii mirkaneessaatiin herrega keessan eeggadhaa.', 'ብመተግበሪ መረጋገጺ ሕሳብኩም ሓልዉ።'],
  ['Two-step verification is enabled', 'ባለሁለት ደረጃ ማረጋገጫ ነቅቷል', 'Mirkaneessi tarkaanfii lamaa hojii irra ooleera', 'ክልተ-ደረጃ ምርግጋጽ ነቒሑ ኣሎ'],
  ['Two-step verification', 'ባለሁለት ደረጃ ማረጋገጫ', 'Mirkaneessa tarkaanfii lamaa', 'ክልተ-ደረጃ ምርግጋጽ'],
  ['Your sign-in uses a password and authenticator code.', 'ለመግባት የይለፍ ቃል እና የማረጋገጫ ኮድ ይጠቀማሉ።', 'Seenuuf jecha icciitii fi koodii mirkaneessaa fayyadama.', 'ንምእታው መሕለፊ ቃልን ኮድ መረጋገጺን ይጥቀም።'],
  ['Use an authenticator app to generate a one-time sign-in code.', 'ለአንድ ጊዜ የመግቢያ ኮድ ለማመንጨት የማረጋገጫ መተግበሪያ ይጠቀሙ።', 'Koodii yeroo tokkoo seensaa uumuuf appii mirkaneessaa fayyadamaa.', 'ንሓደ ግዜ ኮድ መእተዊ ንምፍጣር መተግበሪ መረጋገጺ ተጠቐሙ።'],
  ['Set up authenticator', 'የማረጋገጫ መተግበሪያ ያዘጋጁ', 'Appii mirkaneessaa qopheessaa', 'መተግበሪ መረጋገጺ ኣዳሉ'],
  ['Add this account in your authenticator app using the setup key below.', 'ከታች ያለውን የማዋቀሪያ ቁልፍ በመጠቀም ይህን መለያ ወደ ማረጋገጫ መተግበሪያዎ ያክሉ።', 'Furtuu qophii armaan gadii fayyadamuun herrega kana appii mirkaneessaa keessanitti dabalaa.', 'ታሕቲ ዘሎ መፍትሕ ምድላው ብምጥቃም እዚ ሕሳብ ናብ መተግበሪ መረጋገጺኹም ወስኹ።'],
  ['Six-digit authenticator code', 'ስድስት አሃዝ ያለው የማረጋገጫ ኮድ', 'Koodii mirkaneessaa lakkoofsa ja’a qabu', 'ሽዱሽተ ኣሃዝ ዘለዎ ኮድ መረጋገጺ'],
  ['Verify and enable', 'አረጋግጥ እና አንቃ', 'Mirkaneessi hojii irra oolchi', 'ኣረጋግጽን ኣንቅሕን'],
  ['Eligible candidates', 'ብቁ እጩዎች', 'Kaadhimamtoota ulaagaa guutan', 'ብቑዓት ሕጹያት'],
  ['No verified available workers meet this request yet.', 'ይህን ጥያቄ የሚያሟሉ የተረጋገጡ እና ዝግጁ ሠራተኞች እስካሁን የሉም።', 'Hojjettoonni mirkanaa’anii fi argaman gaaffii kana guutan ammaaf hin jiran.', 'ነዚ ሕቶ ዘማልኡ ዝተረጋገጹን ድሉዋትን ሰራሕተኛታት ክሳብ ሕጂ የለዉን።'],
  ['Propose match', 'ማዛመድ አቅርብ', 'Walitti fiduu dhiyeessi', 'ምዝማድ ኣቕርብ'],
  ['Proposed matches', 'የቀረቡ ማዛመዶች', 'Walitti fiduun dhiyaate', 'ዝቐረቡ ምዝማዳት'],
  ['No matches have been proposed.', 'ማዛመድ እስካሁን አልቀረበም።', 'Ammaaf walitti fiduun hin dhiyaanne.', 'ምዝማድ ክሳብ ሕጂ ኣይቀረበን።'],
  ['Accept & reserve', 'ተቀበል እና ያዝ', 'Fudhadhu fi qabsiisi', 'ተቐበልን ሓዝን'],
  ['Decline', 'እምቢ በል', 'Didi', 'ነጽግ'],
  ['Release reservation', 'የተያዘውን ቦታ ፍታ', 'Qabsiisa hiiki', 'ዝተሓዝአ ምድብ ፍትሕ'],
  ['Worker documents', 'የሠራተኛ ሰነዶች', 'Sanadoota hojjetaa', 'ሰነዳት ሰራሕተኛ'],
  ['No documents uploaded yet.', 'እስካሁን ሰነድ አልተጫነም።', 'Ammaaf sanadoonni hin fe’amne.', 'ክሳብ ሕጂ ሰነድ ኣይተሰቕለን።'],
  ['Download', 'አውርድ', 'Buusi', 'ኣውርድ'],
  ['Verify document', 'ሰነድን አረጋግጥ', 'Sanada mirkaneessi', 'ሰነድ ኣረጋግጽ'],
  ['Upload identity document', 'የመታወቂያ ሰነድ ጫን', 'Sanada eenyummaa olkaa’i', 'ሰነድ መንነት ስቐል'],
  ['Document type', 'የሰነድ ዓይነት', 'Gosa sanadaa', 'ዓይነት ሰነድ'],
  ['National ID', 'ብሔራዊ መታወቂያ', 'Waraqaa eenyummaa biyyaalessaa', 'ሃገራዊ መንነት'],
  ['Police clearance', 'የፖሊስ ማረጋገጫ', 'Ragaa qulqullina poolisii', 'መረጋገጺ ፖሊስ'],
  ['Reference', 'ማጣቀሻ', 'Wabii', 'መወከሲ'],
  ['Certificate', 'ምስክር ወረቀት', 'Ragaa', 'ምስክር ወረቐት'],
  ['Expiry date (if applicable)', 'የማብቂያ ቀን (ካለ)', 'Guyyaa xumuraa (yoo jiraate)', 'ዕለት ምውዳእ (እንተሃልዩ)'],
  ['PDF, JPEG or PNG (up to 10 MB)', 'PDF፣ JPEG ወይም PNG (እስከ 10 MB)', 'PDF, JPEG yookaan PNG (hanga 10 MB)', 'PDF፣ JPEG ወይ PNG (ክሳብ 10 MB)'],
  ['Upload privately', 'በግል ጫን', 'Dhuunfaatti olkaa’i', 'ብሕቡእ ስቐል'],
  ['My leads', 'የእኔ ደንበኞች', 'Maamiltoota koo', 'መራሕተይ'],
  ['Open requests', 'ክፍት ጥያቄዎች', 'Gaaffii banaa', 'ክፉታት ሕቶታት'],
  ['Commission events', 'የኮሚሽን ክስተቶች', 'Taateewwan komishinii', 'ፍጻመታት ኮሚሽን'],
  ['active', 'ንቁ', 'Hojii irra', 'ንጡፍ'],
  ['new', 'አዲስ', 'Haaraa', 'ሓድሽ'],
  ['qualified', 'ብቁ', 'Ulaagaa guute', 'ብቑዕ'],
  ['converted', 'የተቀየረ', 'Jijjiirame', 'ዝተቐየረ'],
  ['lost', 'የጠፋ', 'Dhabame', 'ዝጠፍአ'],
  ['uploaded', 'ተጭኗል', 'Fe’ame', 'ተሰቒሉ'],
  ['under_review', 'በግምገማ ላይ', 'Gamaaggama irra jira', 'ኣብ ግምገማ ዘሎ'],
  ['verified', 'ተረጋግጧል', 'Mirkanaa’eera', 'ተረጋጊጹ'],
  ['rejected', 'ውድቅ ተደርጓል', 'Didameera', 'ተነጺጉ'],
  ['expired', 'ጊዜው አልፏል', 'Yeroon isaa darbeera', 'ግዜኡ ሓሊፉ'],
  ['superseded', 'በአዲስ ተተክቷል', 'Haaraadhaan bakka bu’eera', 'ብሓድሽ ተተኪኡ'],
  ['unavailable', 'አይገኝም', 'Hin argamu', 'ኣይርከብን'],
  ['cancelled', 'ተሰርዟል', 'Haqameera', 'ተሰሪዙ'],
  ['open', 'ክፍት', 'Banaa', 'ክፉት'],
  ['matched', 'ተዛምዷል', 'Walitti fideera', 'ተዛሚዱ'],
  ['closed', 'ተዘግቷል', 'Cufameera', 'ተዓጽዩ'],
  ['proposed', 'ቀርቧል', 'Dhiyaateera', 'ቀሪቡ'],
  ['accepted', 'ተቀባይነት አግኝቷል', 'Fudhatameera', 'ተቐባልነት ረኺቡ'],
  ['declined', 'ውድቅ ተደርጓል', 'Didameera', 'ተነጺጉ'],
  ['immediate', 'ወዲያውኑ', 'Battalumatti', 'ብቕጽበት'],
  ['within_2_weeks', 'በ2 ሳምንታት ውስጥ', 'Torban 2 keessatti', 'ኣብ 2 ሰሙን'],
  ['later', 'በኋላ', 'Booda', 'ጸኒሑ'],
  ['Enter a valid number.', 'ትክክለኛ ቁጥር ያስገቡ።', 'Lakkoofsa sirrii galchaa.', 'ቅኑዕ ቁጽሪ ኣእትዉ።'],
  ['Enter the six-digit code from your authenticator app.', 'ከማረጋገጫ መተግበሪያዎ የስድስት አሃዝ ኮድ ያስገቡ።', 'Koodii lakkoofsa ja’aa appii mirkaneessaa keessan irraa galchaa.', 'ካብ መተግበሪ መረጋገጺኹም ሽዱሽተ ኣሃዝ ዘለዎ ኮድ ኣእትዉ።'],
  ['Choose a document to upload.', 'የሚጫን ሰነድ ይምረጡ።', 'Sanada olkaa’u filadhaa.', 'ዝስቀል ሰነድ ምረጹ።'],
  ['Password updated successfully.', 'የይለፍ ቃሉ በተሳካ ሁኔታ ተዘምኗል።', 'Jechi icciitii milkaa’inaan haaromfameera.', 'መሕለፊ ቃል ብዓወት ተሓዲሱ።'],
  ['Two-step verification enabled.', 'ባለሁለት ደረጃ ማረጋገጫ ነቅቷል።', 'Mirkaneessi tarkaanfii lamaa hojii irra ooleera.', 'ክልተ-ደረጃ ምርግጋጽ ነቒሑ።'],
  ['Document uploaded for compliance review.', 'ሰነዱ ለተገዢነት ግምገማ ተጭኗል።', 'Sanadni gamaaggama to’annoo seeraatiif fe’ameera.', 'ሰነድ ንግምገማ ተገዢነት ተሰቒሉ።'],
  ['Saved successfully.', 'በተሳካ ሁኔታ ተቀምጧል።', 'Milkaa’inaan olkaa’ameera.', 'ብዓወት ተዓቂቡ።'],
  ['Worker verified and ready for matching.', 'ሠራተኛው ተረጋግጦ ለማዛመድ ዝግጁ ነው።', 'Hojjetaan mirkanaa’ee walitti fiduuf qophaa’eera.', 'ሰራሕተኛ ተረጋጊጹ ንምዝማድ ድሉው እዩ።'],
  ['Match proposed.', 'ማዛመዱ ቀርቧል።', 'Walitti fiduun dhiyaateera.', 'ምዝማድ ቀሪቡ።'],
  ['Match accepted and worker reserved.', 'ማዛመዱ ተቀባይነት አግኝቶ ሠራተኛው ተይዟል።', 'Walitti fiduun fudhatamee hojjetaan qabsiifameera.', 'ምዝማድ ተቐቢሉ ሰራሕተኛ ተሓዚኡ።'],
  ['Match declined.', 'ማዛመዱ ውድቅ ተደርጓል።', 'Walitti fiduun didameera.', 'ምዝማድ ተነጺጉ።'],
  ['Reservation released and request reopened.', 'የተያዘው ቦታ ተለቋል እና ጥያቄው እንደገና ተከፍቷል።', 'Qabsiisni hiikamee gaaffiin irra deebi’amee banameera.', 'ምድብ ተፈቲሑ ሕቶ እንደገና ተኸፊቱ።'],
  ['Worker availability after release: immediate, within_2_weeks, or later', 'ከመልቀቁ በኋላ የሠራተኛ አቅርቦት፦ ወዲያውኑ፣ በ2 ሳምንታት ውስጥ ወይም በኋላ', 'Argama hojjetaa erga hiikamee booda: battalumatti, torban 2 keessatti, yookaan booda', 'ድልውነት ሰራሕተኛ ድሕሪ ምፍታሕ፦ ብቕጽበት፣ ኣብ 2 ሰሙን፣ ወይ ጸኒሑ'],
  ['Enter the API server address first.', 'መጀመሪያ የAPI አገልጋይ አድራሻውን ያስገቡ።', 'Jalqaba teessoo sarvarii API galchaa.', 'ቅድሚ ኩሉ ኣድራሻ ሰርቨር API ኣእትዉ።'],
  ['Use a valid HTTPS server URL. HTTP is allowed only for localhost development.', 'ትክክለኛ HTTPS የአገልጋይ URL ይጠቀሙ። HTTP ለlocalhost ልማት ብቻ ይፈቀዳል።', 'URL sarvarii HTTPS sirrii fayyadamaa. HTTP localhost misoomaaf qofa hayyamama.', 'ቅኑዕ URL ሰርቨር HTTPS ተጠቐሙ። HTTP ንlocalhost ምምዕባል ጥራይ ይፍቀድ።'],
  ['Server address saved.', 'የአገልጋይ አድራሻ ተቀምጧል።', 'Teessoon sarvarii olkaa’ameera.', 'ኣድራሻ ሰርቨር ተዓቂቡ።'],
  ['Network request failed. Check your connection and server address.', 'የኔትወርክ ጥያቄ አልተሳካም። ግንኙነትዎን እና የአገልጋይ አድራሻውን ያረጋግጡ።', 'Gaaffiin neetworkii hin milkoofne. Walqunnamtii fi teessoo sarvarii keessan mirkaneessaa.', 'ሕቶ ኔትወርክ ኣይተዓወተን። ርክብኩምን ኣድራሻ ሰርቨርን ኣረጋግጹ።'],
  ['Create an account', 'መለያ ይፍጠሩ', 'Herrega uumaa', 'ሕሳብ ፍጠሩ'],
  ['Sign up', 'ይመዝገቡ', 'Galmaa’aa', 'ተመዝገቡ'],
  ['Apply to join AfroLife', 'ወደ AfroLife ለመቀላቀል ያመልክቱ', 'AfroLife waliin makamuuf iyyadhaa', 'ምስ AfroLife ንምጽንባር ኣመልክቱ'],
  ['Choose account type', 'የመለያ ዓይነት ይምረጡ', 'Gosa herregaa filadhaa', 'ዓይነት ሕሳብ ምረጹ'],
  ['I want to join as a worker', 'እንደ ሠራተኛ መቀላቀል እፈልጋለሁ', 'Hojjetaa ta’ee makamuun barbaada', 'ከም ሰራሕተኛ ክጽንበር እደሊ'],
  ['I want to join as a buyer / customer', 'እንደ ገዢ / ደንበኛ መቀላቀል እፈልጋለሁ', 'Akka bitataa / maamilaatti makamuun barbaada', 'ከም ገዛኢ / ዓሚል ክጽንበር እደሊ'],
  ['Buyer / customer', 'ገዢ / ደንበኛ', 'Bitataa / maamila', 'ገዛኢ / ዓሚል'],
  ['Available property listings', 'ያሉ የንብረት ዝርዝሮች', 'Tarree qabeenya jiran', 'ዝርዝር ንብረታት ዘለዉ'],
  ['Browse available properties and view their pictures.', 'ያሉ ንብረቶችን ይመልከቱ እና ምስሎቻቸውን ይመልከቱ።', 'Qabeenya jiran ilaalaa, suuraawwan isaanii daawwadhaa.', 'ንብረታት ዘለዉ ርኣዩን ስእልታቶም ተመልከቱን።'],
  ['I want to join as a seller / property owner', 'እንደ ሻጭ / የንብረት ባለቤት መቀላቀል እፈልጋለሁ', 'Akka gurguraa / abbaa qabeenyaatti makamuun barbaada', 'ከም ሻየጣይ / ባዓል ንብረት ክጽንበር እደሊ'],
  ['I want to join as an agent', 'እንደ ወኪል መቀላቀል እፈልጋለሁ', 'Bakka bu’aa ta’ee makamuun barbaada', 'ከም ወኪል ክጽንበር እደሊ'],
  ['Agent type', 'የወኪል ዓይነት', 'Gosa bakka bu’aa', 'ዓይነት ወኪል'],
  ['Your territory', 'የእርስዎ ክልል', 'Naannoo keessan', 'ከባቢኹም'],
  ['Master agent phone number', 'የዋና ወኪል ስልክ ቁጥር', 'Lakkoofsa bilbilaa bakka bu’aa olaanaa', 'ቁጽሪ ስልኪ ዋና ወኪል'],
  ['Agent subscription plan', 'የወኪል ምዝገባ ዕቅድ', 'Karoora maallaqa bakka bu’aa', 'መደብ ኣባልነት ወኪል'],
  ['Free plan', 'ነፃ ዕቅድ', 'Karoora bilisaa', 'ነጻ መደብ'],
  ['Pro plan', 'ፕሮ ዕቅድ', 'Karoora Pro', 'መደብ Pro'],
  ['Enterprise plan', 'የድርጅት ዕቅድ', 'Karoora dhaabbataa', 'መደብ ድርጅት'],
  ['Free', 'ነፃ', 'Bilisaa', 'ነጻ'],
  ['Pro', 'ፕሮ', 'Pro', 'Pro'],
  ['Enterprise', 'ድርጅት', 'Dhaabbata', 'ድርጅት'],
  ['Plan choice is recorded as a request only. No payment will be collected or plan activated until billing is configured.', 'የዕቅድ ምርጫዎ እንደ ጥያቄ ብቻ ይመዘገባል። የክፍያ ሥርዓት እስኪዘጋጅ ድረስ ክፍያ አይሰበሰብም ወይም ዕቅድ አይነቃም።', 'Filannoon karooraa gaaffii qofa ta’ee galmaa’a. Sirni kaffaltii hamma qophaa’utti kaffaltiin hin funaanamu, karoorri hin hojii irra oolu.', 'ምርጫ መደብኩም ከም ሕቶ ጥራይ ይምዝገብ። ስርዓት ክፍሊት ክሳብ ዝዳሎ ክፍሊት ኣይእከብን መደብ ኣይንቀሳቐስን።'],
  ['Staff approval is required before sign-in. Your account will remain inactive until compliance review and activation are complete.', 'ከመግባትዎ በፊት የሠራተኛ ፈቃድ ያስፈልጋል። የተገዢነት ግምገማና ማንቃት እስኪጠናቀቁ ድረስ መለያዎ ንቁ አይሆንም።', 'Seenuun dura hayyamni hojjettootaa barbaachisa. Gamaaggamni to’annoo seeraa fi hojii irra oolchuun hamma xumuramutti herregni keessan hin hojii irra oolu.', 'ቅድሚ ምእታው ፍቓድ ሰራሕተኛ የድሊ። ግምገማ ተገዢነትን ምንቃሕን ክሳብ ዝውዳእ ሕሳብኩም ንጡፍ ኣይከውንን።'],
  ['Submit sign-up request', 'የምዝገባ ጥያቄ አስገባ', 'Gaaffii galmee ergaa', 'ሕቶ ምዝገባ ኣቕርብ'],
  ['Already have an account? Sign in', 'መለያ አለዎት? ይግቡ', 'Herrega qabduu? Seenaa', 'ሕሳብ ኣለኩም? እቶ'],
  ['Request received. Staff will review your registration. You can sign in after your account is verified and activated.', 'ጥያቄዎ ደርሷል። ሠራተኞች ምዝገባዎን ይገመግማሉ። መለያዎ ከተረጋገጠና ከነቃ በኋላ መግባት ይችላሉ።', 'Gaaffiin keessan nu gaheera. Hojjettoonni galmee keessan ni gamaaggamu. Herregni keessan erga mirkanaa’ee fi hojii irra oolee booda seenuu dandeessu.', 'ሕቶኹም በጺሑ። ሰራሕተኛታት ምዝገባኹም ክግምግሙ እዮም። ሕሳብኩም ምስ ተረጋገጸን ንጡፍ ምስ ኮነን ክትኣትዉ ትኽእሉ።'],
  ['This field agent is not linked to an active master agent in the selected territory.', 'ይህ የመስክ ወኪል በተመረጠው ክልል ካለ ንቁ ዋና ወኪል ጋር አልተገናኘም።', 'Bakka bu’aan dirree kun naannoo filatame keessatti bakka bu’aa olaanaa hojii irra jiru waliin hin walqabatu.', 'እዚ ወኪል መስክ ኣብቲ ዝተመርጸ ከባቢ ምስ ንጡፍ ዋና ወኪል ኣይተተሓሓዘን።'],
  ['Check the parent agent phone and territory.', 'የዋና ወኪሉን ስልክ ቁጥር እና ክልል ያረጋግጡ።', 'Lakkoofsa bilbilaa fi naannoo bakka bu’aa olaanaa mirkaneessaa.', 'ቁጽሪ ስልኪ ዋና ወኪልን ከባቢን ኣረጋግጹ።'],
  ['Payment not configured', 'ክፍያ አልተዋቀረም', 'Kaffaltiin hin qophoofne', 'ክፍሊት ኣይተዳለወን'],
  ['Plan requested', 'የተጠየቀ ዕቅድ', 'Karoora gaafatame', 'ዝተሓተተ መደብ'],
  ['Sign-up request', 'የምዝገባ ጥያቄ', 'Gaaffii galmee', 'ሕቶ ምዝገባ'],
  ['Application pending approval', 'ማመልከቻው ፈቃድ እየጠበቀ ነው', 'Iyyannoon hayyama eeggataa jira', 'ምልክታ ፍቓድ ይጽበ ኣሎ'],
  ['Registration submitted. No payment was taken and no subscription is active.', 'ምዝገባ ቀርቧል። ምንም ክፍያ አልተወሰደም እና ምዝገባ አልነቃም።', 'Galmeen dhiyaateera. Kaffaltiin hin fudhatamne, maallaqni ji’aa hojii irra hin oolle.', 'ምዝገባ ቀሪቡ። ክፍሊት ኣይተወሰደን፣ ኣባልነት ንጡፍ ኣይኮነን።'],
  ['My account', 'የእኔ መለያ', 'Herrega koo', 'ሕሳበይ'],
  ['Account type', 'የመለያ ዓይነት', 'Gosa herregaa', 'ዓይነት ሕሳብ'],
  ['Select a plan', 'ዕቅድ ይምረጡ', 'Karoora filadhaa', 'መደብ ምረጹ'],
  ['Select an account type', 'የመለያ ዓይነት ይምረጡ', 'Gosa herregaa filadhaa', 'ዓይነት ሕሳብ ምረጹ'],
  ['Select an agent type', 'የወኪል ዓይነት ይምረጡ', 'Gosa bakka bu’aa filadhaa', 'ዓይነት ወኪል ምረጹ'],
  ['Select your territory', 'ክልልዎን ይምረጡ', 'Naannoo keessan filadhaa', 'ከባቢኹም ምረጹ'],
  ['Your password must be at least 12 characters.', 'የይለፍ ቃልዎ ቢያንስ 12 ቁምፊዎች መሆን አለበት።', 'Jechi icciitii keessan yoo xiqqaate qubee 12 qabaachuu qaba.', 'መሕለፊ ቃልኩም ብውሑዱ 12 ፊደላት ክህልዎ ኣለዎ።'],
  ['Password confirmation does not match.', 'የይለፍ ቃል ማረጋገጫው አይዛመድም።', 'Mirkaneessi jecha icciitii wal hin simne.', 'ምርግጋጽ መሕለፊ ቃል ኣይሰማማዕን።'],
  ['Password confirmation', 'የይለፍ ቃል ማረጋገጫ', 'Mirkaneessa jecha icciitii', 'ምርግጋጽ መሕለፊ ቃል'],
  ['Email (optional)', 'ኢሜይል (አማራጭ)', 'Imeelii (dirqama miti)', 'ኢመይል (ኣማራጺ)'],
  ['Phone must be a valid Ethiopian number.', 'ስልክ ቁጥሩ ትክክለኛ የኢትዮጵያ ቁጥር መሆን አለበት።', 'Lakkoofsi bilbilaa lakkoofsa Itoophiyaa sirrii ta’uu qaba.', 'ቁጽሪ ስልኪ ቅኑዕ ቁጽሪ ኢትዮጵያ ክኸውን ኣለዎ።'],
  ['This account is pending staff approval.', 'ይህ መለያ የሠራተኛ ፈቃድ እየጠበቀ ነው።', 'Herregni kun hayyama hojjettootaa eeggataa jira.', 'እዚ ሕሳብ ፍቓድ ሰራሕተኛ ይጽበ ኣሎ።'],
  ['Sign-up request received.', 'የምዝገባ ጥያቄ ደርሷል።', 'Gaaffiin galmee nu gaheera.', 'ሕቶ ምዝገባ በጺሑ።'],
  ['Language', 'ቋንቋ', 'Afaan', 'ቋንቋ'],
  ['AGENCY PLATFORM', 'የኤጀንሲ መድረክ', 'Waltajjii bakka bu’ummaa', 'መድረኽ ኤጀንሲ'],
  ['Agent subscription plans', 'የወኪል ምዝገባ ዕቅዶች', 'Karoora maallaqa bakka bu’aa', 'መደባት ኣባልነት ወኪል'],
  ['Account created for {{name}}. Temporary password (shown once): {{password}}', 'ለ{{name}} መለያ ተፈጥሯል። ጊዜያዊ የይለፍ ቃል (አንድ ጊዜ ብቻ ይታያል): {{password}}', 'Herregni {{name}} uumameera. Jechi icciitii yeroo (yeroo tokko qofa mul’ata): {{password}}', 'ሕሳብ {{name}} ተፈጢሩ። ግዝያዊ መሕለፊ ቃል (ሓደ ግዜ ጥራይ ይርአ): {{password}}'],
  ['Admin workspace', 'የአስተዳዳሪ የሥራ ቦታ', 'Iddoo hojii bulchaa', 'ቦታ ስራሕ ኣማሓዳሪ'],
  ['Super Admin', 'ሱፐር አስተዳዳሪ', 'Bulchaa olaanaa', 'ሱፐር ኣማሓዳሪ'],
  ['Open skills', 'ክፍት ክህሎቶች', 'Dandeettii banaa', 'ክፉታት ክእለታት'],
  ['not specified', 'አልተገለጸም', 'Hin ibsamne', 'ኣይተገልጸን'],
  ['{{phone}} · Lead · {{date}}', '{{phone}} · ደንበኛ · {{date}}', '{{phone}} · Maamila · {{date}}', '{{phone}} · መራሒ · {{date}}'],
  ['{{sector}} · {{years}} years experience', '{{sector}} · {{years}} ዓመት ልምድ', '{{sector}} · muuxannoo waggaa {{years}}', '{{sector}} · {{years}} ዓመት ተመኩሮ'],
  ['Rate ETB {{rate}} · Request', 'ክፍያ ETB {{rate}} · ጥያቄ', 'Gatii ETB {{rate}} · Gaaffii', 'ዋጋ ETB {{rate}} · ሕቶ'],
  ['{{phone}} · {{type}}', '{{phone}} · {{type}}', '{{phone}} · {{type}}', '{{phone}} · {{type}}'],
  ['ETB {{rate}} · {{skills}} · {{status}}', 'ETB {{rate}} · {{skills}} · {{status}}', 'ETB {{rate}} · {{skills}} · {{status}}', 'ETB {{rate}} · {{skills}} · {{status}}'],
  ['{{phone}} · {{role}} · {{plan}}', '{{phone}} · {{role}} · {{plan}}', '{{phone}} · {{role}} · {{plan}}', '{{phone}} · {{role}} · {{plan}}'],
  ['Leads {{leads}} · Workers {{workers}} · Open disputes {{disputes}}', 'ደንበኞች {{leads}} · ሠራተኞች {{workers}} · ክፍት ክርክሮች {{disputes}}', 'Maamiltoota {{leads}} · Hojjettoota {{workers}} · Walitti bu’iinsa banaa {{disputes}}', 'መራሕቲ {{leads}} · ሰራሕተኛታት {{workers}} · ክፉታት ክርክራት {{disputes}}'],
  ['Match score {{score}}%', 'የማዛመድ ውጤት {{score}}%', 'Qabxii walitti fiduu {{score}}%', 'ውጽኢት ምዝማድ {{score}}%'],
  ['Expires {{date}}', 'የሚያበቃው {{date}}', 'Guyyaan xumuraa {{date}}', 'ዝውዳእ {{date}}'],
  ['Choose an agent type, territory, and plan.', 'የወኪል ዓይነት፣ ክልል እና ዕቅድ ይምረጡ።', 'Gosa bakka bu’aa, naannoo fi karoora filadhaa.', 'ዓይነት ወኪል፣ ከባቢን መደብን ምረጹ።'],
  ['Choose a valid territory.', 'ትክክለኛ ክልል ይምረጡ።', 'Naannoo sirrii filadhaa.', 'ቅኑዕ ከባቢ ምረጹ።'],
  ['A field agent needs a master agent', 'የመስክ ወኪል ዋና ወኪል ያስፈልገዋል', 'Bakka bu’aan dirree bakka bu’aa olaanaa barbaada', 'ወኪል መስክ ዋና ወኪል የድልዮ'],
  ['Agent type, territory, parent agent, and plan are only used for agent registrations.', 'የወኪል ዓይነት፣ ክልል፣ ዋና ወኪል እና ዕቅድ ለወኪል ምዝገባ ብቻ ይጠቀማሉ።', 'Gosti bakka bu’aa, naannoo, bakka bu’aa olaanaa fi karoora galmee bakka bu’aatiif qofa fayyadu.', 'ዓይነት ወኪል፣ ከባቢ፣ ዋና ወኪልን መደብን ንምዝገባ ወኪል ጥራይ ይጥቀሙ።'],
  ['Signed in as {{role}}. Your access is limited to your assigned role and territory.', 'እንደ {{role}} ገብተዋል። መዳረሻዎ በተመደበልዎ ሚና እና ክልል የተገደበ ነው።', 'Akka {{role}} seentani. Seensaan keessan gahee fi naannoo isiniif ramadame qofatti daangeffama.', 'ከም {{role}} ኣቲኹም። መእተዊኹም ብግደን ከባቢን ዝተመደበልኩም ይድረት።'],
  ['Request failed ({{status}})', 'ጥያቄው አልተሳካም ({{status}})', 'Gaaffiin hin milkoofne ({{status}})', 'ሕቶ ኣይተዓወተን ({{status}})'],
  ['Too many requests. Please try again in {{seconds}} seconds.', 'ብዙ ጥያቄዎች ተልከዋል። እባክዎ ከ{{seconds}} ሰከንድ በኋላ እንደገና ይሞክሩ።', 'Gaaffiiwwan baay’atan. Maaloo sekondii {{seconds}} booda irra deebi’ii yaali.', 'ብዙሓት ሕቶታት ተላኢኾም። በጃኹም ድሕሪ {{seconds}} ሰከንድ እንደገና ፈትኑ።'],
  ['Too many failed attempts. Try again in 15 minutes.', 'ብዙ ያልተሳኩ ሙከራዎች ተደርገዋል። እባክዎ ከ15 ደቂቃ በኋላ ይሞክሩ።', 'Yaaliiwwan baay’een hin milkoofne. Maaloo daqiiqaa 15 booda yaali.', 'ብዙሓት ዘይተዓወቱ ፈተነታት ተገይሮም። በጃኹም ድሕሪ 15 ደቒቕ ፈትኑ።'],
  ['Worker applicants must consent to identity and eligibility document review before uploading KYC documents.', 'የሠራተኛ አመልካቾች የKYC ሰነዶችን ከመጫናቸው በፊት ለመታወቂያ እና ብቁነት ማረጋገጫ እንዲጠቀሙባቸው መስማማት አለባቸው።', 'Iyyattoonni hojjetaa sanadoota KYC olkaa’uu isaanii dura eenyummaa fi ulaagaa mirkaneessuuf akka ilaalaman eeyyamuu qabu.', 'ኣመልከትቲ ሰራሕተኛ ሰነዳት KYC ቅድሚ ምጽዓኖም ንመንነትን ብቕዓትን ምርግጋጽ ክጥቀሙሎም ፍቓዶም ክህቡ ኣለዎም።'],
  ['Consent to worker document review', 'ለሠራተኛ ሰነዶች ግምገማ ፈቃድ', 'Eeyyama sakatta’iinsa sanada hojjetaa', 'ፍቓድ ንምርመራ ሰነድ ሰራሕተኛ'],
  ['AfroLife may use my National ID and police-clearance documents to verify my identity and assess eligibility for workforce services. Authorized compliance staff will review these documents, which are stored privately.', 'AfroLife የመታወቂያ ካርዴን እና የፖሊስ ማረጋገጫ ሰነዶቼን ማንነቴን ለማረጋገጥ እና ለሥራ አገልግሎቶች ብቁነቴን ለመገምገም እንዲጠቀምባቸው እስማማለሁ። ፈቃድ ያላቸው የCompliance ሠራተኞች ይመረምሯቸዋል፤ ሰነዶቹም በግል ይቀመጣሉ።', 'AfroLife sanada eenyummaa fi ragaa poolisii koo eenyummaa koo mirkaneessuu fi tajaajila hojii keessatti ulaagaa koo madaaluuf akka fayyadamu nan eeyyama. Hojjettoonni compliance hayyamaman sanadoota kana ni sakatta’u; isaanis iccitiidhaan kuufamu.', 'AfroLife ንመንነተይ ንምርግጋጽን ንኣገልግሎት ስራሕ ብቕዓተይ ንምግምጋምን ናይ መንነት መለለዪን ናይ ፖሊስ ሰነዳትን ክጥቀመሎም እሰማማዕ። ፍቓድ ዘለዎም ሰራሕተኛታት Compliance ክምርምርዎም እዮም፤ ብሕታዊ ብዝኾነ መንገዲ ይቕመጡ።'],
  ['Commissions', 'ኮሚሽኖች', 'Koomishinii', 'ኮሚሽናት'],
  ['Review earned commissions, current holdbacks, and eligible releases.', 'የተገኙ ኮሚሽኖችን፣ የተያዙ መጠኖችን እና ለመክፈል የደረሱትን ይመልከቱ።', 'Koomishinii argaman, maallaqa qabame fi kan gadi lakkifamu sakatta’aa.', 'እተረኽቡ ኮሚሽናት፣ ዝተታሕዘ ገንዘብን ክፍሊትን ርአዩ።'],
  ['No commission events are available for your account.', 'ለመለያዎ የኮሚሽን መዝገቦች አልተገኙም።', 'Galmeen koomishinii herrega keessaniif hin jiru.', 'ንመለያኹም ዝምልከት መዝገብ ኮሚሽን የለን።'],
  ['Contract {{contract}} · Total ETB {{total}} · First payment ETB {{immediate}} · Held ETB {{held}}', 'ውል {{contract}} · ጠቅላላ ETB {{total}} · የመጀመሪያ ክፍያ ETB {{immediate}} · የተያዘ ETB {{held}}', 'Waliigaltee {{contract}} · Waliigala ETB {{total}} · Kaffaltii jalqabaa ETB {{immediate}} · Qabame ETB {{held}}', 'ውዕል {{contract}} · ጠቕላላ ETB {{total}} · ቀዳማይ ክፍሊት ETB {{immediate}} · ዝተታሕዘ ETB {{held}}'],
  ['Release date {{date}}', 'የመልቀቂያ ቀን {{date}}', 'Guyyaa gadi-lakkisuu {{date}}', 'ዕለት ምፍታሕ {{date}}'],
  ['Approve commission', 'ኮሚሽኑን አጽድቅ', 'Koomishinii raggaasisi', 'ነቲ ኮሚሽን ኣጽድቕ'],
  ['Pay first installment', 'የመጀመሪያ ክፍያውን ክፈል', 'Kaffaltii jalqabaa kaffali', 'ቀዳማይ ክፍሊት ክፈሉ'],
  ['Release eligible holdback', 'የደረሰውን የተያዘ ክፍያ ልቀቅ', 'Maallaqa qabame yeroo isaa gahe gadi lakkisi', 'እቲ ግዜኡ ዝበጽሐ ዝተታሕዘ ክፍሊት ፍትሑ'],
  ['Enter the payment reference.', 'የክፍያ ማጣቀሻ ያስገቡ።', 'Wabii kaffaltii galchi.', 'መወከሲ ክፍሊት ኣእትዉ።'],
  ['Commission approved.', 'ኮሚሽኑ ጸድቋል።', 'Koomishiniin ragga’eera.', 'ኮሚሽን ጸዲቑ።'],
  ['Commission installment paid.', 'የኮሚሽን ክፍያ ተከፍሏል።', 'Kaffaltiin koomishinii kaffalameera.', 'ክፍሊት ኮሚሽን ተኸፊሉ።'],
  ['Commission holdback released.', 'የተያዘው የኮሚሽን ክፍያ ተለቋል።', 'Maallaqni koomishinii qabame gadi lakkifameera.', 'ዝተታሕዘ ክፍሊት ኮሚሽን ተፈቲሑ።'],
  ['Current password is incorrect', 'የአሁኑ የይለፍ ቃል ትክክል አይደለም', 'Jechi icciitii ammaa sirrii miti', 'እዋናዊ መሕለፊ ቃል ቅኑዕ ኣይኮነን'],
  ['Invalid credentials or inactive account', 'የመግቢያ መረጃው ትክክል አይደለም ወይም መለያው ንቁ አይደለም', 'Ragaan seensaa sirrii miti yookaan herregni hojii irra hin jiru', 'መረዳእታ መእተዊ ቅኑዕ ኣይኮነን ወይ ሕሳብ ንጡፍ ኣይኮነን'],
  ['Too many failed attempts. Try again in 15 minutes.', 'ብዙ ያልተሳኩ ሙከራዎች። ከ15 ደቂቃ በኋላ እንደገና ይሞክሩ።', 'Yaaliin kufaa baay’ateera. Daqiiqaa 15 booda irra deebi’aa.', 'ፈተነታት ዘይተዓወቱ ብዙሓት እዮም። ድሕሪ 15 ደቓይቕ እንደገና ፈትኑ።'],
  ['Invalid code', 'ትክክል ያልሆነ ኮድ', 'Koodii sirrii hin taane', 'ቅኑዕ ዘይኮነ ኮድ'],
  ['Duplicate record (e.g. phone already used, or commission already exists)', 'የተደጋገመ መዝገብ (ለምሳሌ ስልክ ቁጥሩ አስቀድሞ ተጠቅሟል)', 'Galmeen irra deddeebi’e (fakkeenyaaf lakkoofsi bilbilaa duraan fayyadame)', 'ዝተደጋገመ መዝገብ (ንኣብነት ቁጽሪ ስልኪ ቀደም ተጠቒሙ)'],
  ['{{sector}} · ETB {{rate}} · {{territory}}', '{{sector}} · ETB {{rate}} · {{territory}}', '{{sector}} · ETB {{rate}} · {{territory}}', '{{sector}} · ETB {{rate}} · {{territory}}'],
  ['{{years}} years · match score {{score}}%', '{{years}} ዓመት · የማዛመድ ውጤት {{score}}%', 'Muuxannoo waggaa {{years}} · qabxii walitti fiduu {{score}}%', '{{years}} ዓመት · ውጽኢት ምዝማድ {{score}}%'],
  ['Document {{decision}}.', 'ሰነዱ {{decision}}።', 'Sanadni {{decision}}.', 'ሰነድ {{decision}}።'],
  ['Account marked {{decision}}.', 'መለያው {{decision}} ተብሎ ተመዝግቧል።', 'Herregni {{decision}} jedhamee mallatteeffameera.', 'ሕሳብ {{decision}} ተባሂሉ ተምልኪቱ።'],
  ['Account activated.', 'መለያው ነቅቷል።', 'Herregni hojii irra ooleera.', 'ሕሳብ ነቒሑ።'],
  ['Account deactivated.', 'መለያው ቦዝኗል።', 'Herregni hojii dhaabeera.', 'ሕሳብ ተቦዚኑ።'],
  ['Choose restored availability after release: immediate, within_2_weeks, or later', 'ከመልቀቅ በኋላ የሚመለሰውን አቅርቦት ይምረጡ፦ ወዲያውኑ፣ በ2 ሳምንታት ውስጥ ወይም በኋላ', 'Argama erga hiikamee booda filadhaa: battalumatti, torban 2 keessatti, yookaan booda', 'ድልውነት ድሕሪ ምፍታሕ ምረጹ፦ ብቕጽበት፣ ኣብ 2 ሰሙን፣ ወይ ጸኒሑ'],
  ['Choose a restored availability', 'የሚመለሰውን አቅርቦት ይምረጡ', 'Argama deebifamu filadhaa', 'ዝምለስ ድልውነት ምረጹ'],
  ['Worker availability', 'የሠራተኛ አቅርቦት', 'Argama hojjetaa', 'ድልውነት ሰራሕተኛ'],
  ['Cancel', 'ሰርዝ', 'Haqi', 'ሰርዝ'],
  ['ETHIOLIFE REGISTRATION', 'የETHIOLIFE ምዝገባ', 'GALMEE ETHIOLIFE', 'ምዝገባ ETHIOLIFE'],
  ['Internal error', 'ውስጣዊ ስህተት', 'Dogoggora keessaa', 'ጌጋ ውሽጣዊ'],
  ['Business rules', 'የንግድ ደንቦች', 'Seerota daldalaa', 'ሕግታት ንግዲ'],
  ['Changes apply to new calculations immediately. Unsigned contracts are repriced; signed contracts, recorded payments, and ledger entries are not rewritten.', 'ለውጦቹ ወዲያውኑ በአዲስ ስሌቶች ላይ ይተገበራሉ። ያልተፈረሙ ውሎች ዋጋቸው ይሰላል፤ የተፈረሙ ውሎች፣ የተመዘገቡ ክፍያዎች እና የሂሳብ መዝገቦች አይቀየሩም።', 'Jijjiiramni battalumatti shallaggii haaraa irratti hojiirra oola. Waliigalteewwan hin mallatteeffamne irra deebi’anii shallagamu; waliigalteewwan mallatteeffaman, kaffaltiin galmaa’e fi galmeen herregaa hin jijjiiramu.', 'ለውጢ ብቕጽበት ኣብ ሓደስቲ ሕሳባት ይትግበር። ዘይተፈረሙ ውዕላት ዋጋኦም እንደገና ይሕሰብ፤ ዝተፈረሙ ውዕላት፣ ዝተመዝገቡ ክፍሊታትን መዝገብ ሕሳብን ኣይቀየሩን።'],
  ['Required identity and police-clearance checks, role permissions, and separate payment approvals cannot be disabled here.', 'የግዴታ የማንነትና የፖሊስ ማረጋገጫ ፍተሻዎች፣ የሚና ፈቃዶች እና የተለያዩ የክፍያ ማጽደቆች እዚህ ሊሰናከሉ አይችሉም።', 'Mirkaneessi eenyummaa fi qulqullina poolisii, hayyamni gahee, fi mirkaneessi kaffaltii namoota adda addaa kun asitti cufamuu hin danda’an.', 'ግዴታዊ ምርመራ መንነትን ናይ ፖሊስ ምስክርነትን፣ ፍቓድ ሚናን ናይ ተፈላለዩ ሰባት ምጽዳቕ ክፍሊትን ኣብዚ ክስናኸሉ ኣይክእሉን።'],
  ['Contract pricing', 'የውል ዋጋ አወጣጥ', 'Gatii waliigaltee', 'ዋጋ ውዕሊ'],
  ['Agent plans', 'የወኪል ዕቅዶች', 'Karoora bakka bu’aa', 'መደባት ወኪል'],
  ['Worker matching', 'የሠራተኛ ማዛመድ', 'Walitti fiduu hojjettootaa', 'ምዝማድ ሰራሕተኛታት'],
  ['Worker eligibility', 'የሠራተኛ ብቁነት', 'Ulaagaalee hojjetaa', 'ብቕዓት ሰራሕተኛ'],
  ['Property management', 'የንብረት አስተዳደር', 'Bulchiinsa qabeenyaa', 'ምምሕዳር ንብረት'],
  ['Contract workflow', 'የውል የሥራ ሂደት', 'Adeemsa hojii waliigaltee', 'መስርሕ ውዕሊ'],
  ['Refunds', 'ተመላሽ ክፍያዎች', 'Deebii kaffaltii', 'ምምላስ ክፍሊት'],
  ['Track A onboarding fee (%)', 'የትራክ A ምዝገባ ክፍያ (%)', 'Kaffaltii galmee Track A (%)', 'ክፍሊት ምጅማር Track A (%)'],
  ['Track A guarantee (%)', 'የትራክ A ዋስትና (%)', 'Wabii Track A (%)', 'ውሕስነት Track A (%)'],
  ['Track A monthly management fee (%)', 'የትራክ A ወርሃዊ አስተዳደር ክፍያ (%)', 'Kaffaltii bulchiinsa ji’aa Track A (%)', 'ወርሓዊ ክፍሊት ምምሕዳር Track A (%)'],
  ['Track B employer fee (%)', 'የትራክ B አሠሪ ክፍያ (%)', 'Kaffaltii hojjechiisaa Track B (%)', 'ክፍሊት ኣስራሒ Track B (%)'],
  ['Track B other fee (%)', 'የትራክ B ሌላ ክፍያ (%)', 'Kaffaltii biraa Track B (%)', 'ካልእ ክፍሊት Track B (%)'],
  ['First-contract commission (%)', 'የመጀመሪያ ውል ኮሚሽን (%)', 'Koomishini waliigaltee jalqabaa (%)', 'ኮሚሽን ቀዳማይ ውዕሊ (%)'],
  ['Include guarantee in commission calculation', 'ዋስትናን በኮሚሽን ስሌት ውስጥ ያካትቱ', 'Wabiin shallaggii koomishinii keessatti haa dabalamu', 'ውሕስነት ኣብ ሕሳብ ኮሚሽን ኣእቱ'],
  ['Pro monthly price (ETB)', 'የፕሮ ወርሃዊ ዋጋ (ETB)', 'Gatii ji’aa Pro (ETB)', 'ወርሓዊ ዋጋ Pro (ETB)'],
  ['Enterprise monthly price (ETB)', 'የኢንተርፕራይዝ ወርሃዊ ዋጋ (ETB)', 'Gatii ji’aa Enterprise (ETB)', 'ወርሓዊ ዋጋ Enterprise (ETB)'],
  ['Paid-plan renewal grace period (days)', 'ለተከፈለ ዕቅድ የእድሳት ተጨማሪ ጊዜ (ቀናት)', 'Yeroo dabalataa haaromsaa karoora kaffaltii (guyyaa)', 'ናይ ምሕዳስ ግዜ ምሕረት ዝተኸፍለ መደብ (መዓልታት)'],
  ['Skills match weight', 'የክህሎት ማዛመድ ክብደት', 'Ulfaatina walitti fiduu dandeettii', 'ክብደት ምዝማድ ክእለት'],
  ['Location match weight', 'የአካባቢ ማዛመድ ክብደት', 'Ulfaatina walitti fiduu bakka', 'ክብደት ምዝማድ ቦታ'],
  ['Availability match weight', 'የመገኘት ማዛመድ ክብደት', 'Ulfaatina walitti fiduu argama', 'ክብደት ምዝማድ ድልውነት'],
  ['Experience match weight', 'የልምድ ማዛመድ ክብደት', 'Ulfaatina walitti fiduu muuxannoo', 'ክብደት ምዝማድ ተመኩሮ'],
  ['Rate match weight', 'የክፍያ መጠን ማዛመድ ክብደት', 'Ulfaatina walitti fiduu gatii', 'ክብደት ምዝማድ ዋጋ'],
  ['Language match weight', 'የቋንቋ ማዛመድ ክብደት', 'Ulfaatina walitti fiduu afaanii', 'ክብደት ምዝማድ ቋንቋ'],
  ['Minimum candidate score (%)', 'ዝቅተኛ የእጩ ውጤት (%)', 'Qabxii xiqqaa kaadhimamaa (%)', 'ዝተሓተ ነጥቢ ሕጹይ (%)'],
  ['Sibling-area location score factor', 'ለአጎራባች አካባቢ የቦታ ውጤት መጠን', 'Qooda qabxii bakka naannoo ollaa', 'መጠን ነጥቢ ቦታ ከባቢ ጎረቤት'],
  ['Available within two weeks score', 'በሁለት ሳምንት ውስጥ የሚገኝ ውጤት', 'Qabxii argamu torban lama keessatti', 'ነጥቢ ኣብ ክልተ ሰሙን ዝርከብ'],
  ['Available later score', 'በኋላ የሚገኝ ውጤት', 'Qabxii yeroo booda argamu', 'ነጥቢ ድሒሩ ዝርከብ'],
  ['Rate tolerance above offer (%)', 'ከቀረበው በላይ የክፍያ መጠን መቻቻል (%)', 'Danda’ama gatii dhiyaate ol (%)', 'ትዕግስቲ ዋጋ ልዕሊ ዝቐረበ (%)'],
  ['Require a verified reference document', 'የተረጋገጠ የማጣቀሻ ሰነድ ይጠይቁ', 'Sanada wabii mirkanaa’e barbaadi', 'ዝተረጋገጸ ሰነድ ምስክርነት ሕተት'],
  ['Require a verified certificate', 'የተረጋገጠ ሰርተፍኬት ይጠይቁ', 'Ragaa mirkanaa’e barbaadi', 'ዝተረጋገጸ ምስክር ወረቐት ሕተት'],
  ['Default rent due day', 'ነባሪ የኪራይ መክፈያ ቀን', 'Guyyaa kaffaltii kiraa durtii', 'ነባሪ መዓልቲ ክፍሊት ኪራይ'],
  ['Maximum lease term (months)', 'ከፍተኛ የኪራይ ውል ጊዜ (ወራት)', 'Yeroo waliigaltee kiraa ol’aanaa (ji’a)', 'ዝለዓለ ግዜ ውዕሊ ኪራይ (ኣዋርሕ)'],
  ['Invoice payment period (days)', 'የደረሰኝ ክፍያ ጊዜ (ቀናት)', 'Yeroo kaffaltii nagahee (guyyaa)', 'ግዜ ክፍሊት ደረሰኝ (መዓልታት)'],
  ['Maximum fee refund (% of fees collected)', 'ከተሰበሰበው ክፍያ የሚመለስ ከፍተኛ መጠን (%)', 'Deebii kaffaltii irraa olaanaa (% kaffaltii walitti qabame)', 'ዝለዓለ ምምላስ ካብ ዝተኣከበ ክፍሊት (%)'],
  ['Maximum guarantee refund (% of guarantee held)', 'ከተያዘው ዋስትና የሚመለስ ከፍተኛ መጠን (%)', 'Deebii wabii irraa olaanaa (% wabii qabame)', 'ዝለዓለ ምምላስ ካብ ዝተሓዘ ውሕስነት (%)'],
  ['Save business rules', 'የንግድ ደንቦችን አስቀምጥ', 'Seerota daldalaa olkaa’i', 'ሕግታት ንግዲ ዓቅብ'],
  ['No business rule changes to save.', 'የሚቀመጥ የንግድ ደንብ ለውጥ የለም።', 'Jijjiiramni seera daldalaa olkaa’amu hin jiru.', 'ዝቕመጥ ለውጢ ሕጊ ንግዲ የለን።'],
  ['Business rules saved. {{count}} unsigned contracts were repriced.', 'የንግድ ደንቦች ተቀምጠዋል። {{count}} ያልተፈረሙ ውሎች ዋጋቸው እንደገና ተሰልቷል።', 'Seerotni daldalaa olkaa’aman. Waliigalteewwan mallattoo hin qabne {{count}} irra deebi’anii gatii isaanii shallagameera.', 'ሕግታት ንግዲ ተዓቂቦም። {{count}} ዘይተፈረሙ ውዕላት ዋጋኦም እንደገና ተሓሲቡ።'],
  ['Pro plan — ETB {{amount}} per month', 'ፕሮ ዕቅድ — ETB {{amount}} በወር', 'Karoora Pro — ETB {{amount}} ji’atti', 'መደብ Pro — ETB {{amount}} ኣብ ወርሒ'],
  ['Enterprise plan — ETB {{amount}} per month', 'የድርጅት ዕቅድ — ETB {{amount}} በወር', 'Karoora Enterprise — ETB {{amount}} ji’atti', 'መደብ Enterprise — ETB {{amount}} ኣብ ወርሒ'],
  ['KYC identity document (PDF, JPEG, PNG · max 10 MB)', 'የKYC መታወቂያ ሰነድ (PDF፣ JPEG፣ PNG · ከፍተኛ 10 ሜባ)', 'Sanada eenyummaa KYC (PDF, JPEG, PNG · hanga 10 MB)', 'ሰነድ መንነት KYC (PDF, JPEG, PNG · ዝለዓለ 10 MB)'],
  ['Police clearance (required for worker applicants)', 'የፖሊስ የሥነ-ምግባር ማረጋገጫ (ለሠራተኛ አመልካቾች ግዴታ)', 'Ragaa qulqullina poolisii (kaadhimamtoota hojjetaaaf dirqama)', 'ምስክር ናይ ፖሊስ (ንኣመልከትቲ ሰራሕተኛታት ግዴታ)'],
  ['Documents are stored privately and reviewed by AfroLife compliance staff.', 'ሰነዶች በግል ይቀመጣሉ እና በAfroLife የተገዢነት ሠራተኞች ይገመገማሉ።', 'Sanadoonni iccitiidhaan kuufamu, hojjettoota to’annoo AfroLife tiin ilaalamu.', 'ሰነዳት ብምስጢር ይቕመጡ፣ ብሰራሕተኛታት ተገዢነት AfroLife ይግምገሙ።'],
  ['Property listings', 'ዝርዝር ንብረት', 'Tarree qabeenyaa', 'ዝርዝር ንብረት'],
  ['Create and manage property records, units, rent details, and private listing pictures.', 'የንብረት መዝገቦችን፣ ክፍሎችን፣ የኪራይ ዝርዝሮችን እና የግል ሥዕሎችን ይፍጠሩ እና ያስተዳድሩ።', 'Galmee qabeenyaa, kutaa, odeeffannoo kiraa fi suuraa iccitiin kuufamu uumuu fi bulchuu.', 'Galmee qabeenyaa፣ kutaa፣ bal’ina kiraaን ስእሊ ንብረትን ፍጠሩን ኣመሓድሩን።'],
  ['Add a property listing', 'የንብረት ዝርዝር ጨምር', 'Qabeenya tarree irratti dabali', 'ዝርዝር ንብረት ወስኽ'],
  ['Street address', 'የጎዳና አድራሻ', 'Teessoo daandii', 'ኣድራሻ ጎደና'],
  ['Property type', 'የንብረት ዓይነት', 'Gosa qabeenyaa', 'ዓይነት ንብረት'],
  ['Apartment building', 'የአፓርታማ ሕንፃ', 'Gamoo apartimantii', 'ህንጻ ኣፓርታማ'],
  ['House', 'ቤት', 'Mana', 'ገዛ'],
  ['Commercial', 'ንግድ', 'Daldalaa', 'ንግዳዊ'],
  ['Land', 'መሬት', 'Lafa', 'መሬት'],
  ['First unit number', 'የመጀመሪያ ክፍል ቁጥር', 'Lakkoofsa kutaa jalqabaa', 'ቁጽሪ ቀዳማይ ክፍሊ'],
  ['Floor (optional)', 'ፎቅ (አማራጭ)', 'Darbii (filannoo)', 'ደርቢ (ኣማራጺ)'],
  ['Monthly rent (ETB, optional)', 'ወርሃዊ ኪራይ (ETB፣ አማራጭ)', 'Kiraa ji’aa (ETB, filannoo)', 'ወርሓዊ ኪራይ (ETB፣ ኣማራጺ)'],
  ['Listing pictures (JPEG or PNG, up to 10 MB each)', 'የዝርዝር ሥዕሎች (JPEG ወይም PNG፣ እያንዳንዱ እስከ 10 ሜባ)', 'Suuraa tarree (JPEG yookaan PNG, tokkoon tokkoon hanga 10 MB)', 'ስእሊ ዝርዝር (JPEG ወይ PNG፣ ነፍሲ ወከፍ ክሳብ 10 MB)'],
  ['On Android, use the camera or choose images from your device. Pictures are kept private and only shown to authorized users.', 'በAndroid ላይ ካሜራውን ይጠቀሙ ወይም ከመሣሪያዎ ሥዕሎችን ይምረጡ። ሥዕሎች በግል ይቀመጣሉ እና ለተፈቀዱ ተጠቃሚዎች ብቻ ይታያሉ።', 'Android irratti kaameraa fayyadamaa yookaan suuraa meeshaa keessan irraa filadhaa. Suuraan iccitiidhaan kuufama, fayyadamtoota hayyamamaniif qofa mul’ata.', 'ኣብ Android ካሜራ ተጠቐሙ ወይ ካብ መሳርሒኹም ስእሊ ምረጹ። ስእሊ ብምስጢር ይቕመጥ፣ ንዝተፈቕደሎም ተጠቀምቲ ጥራይ ይርአ።'],
  ['Save property listing', 'የንብረት ዝርዝር አስቀምጥ', 'Tarree qabeenyaa olkaa’i', 'ዝርዝር ንብረት ዓቅብ'],
  ['No property listings yet. Add a property to start the listing.', 'እስካሁን የንብረት ዝርዝር የለም። ዝርዝር ለመጀመር ንብረት ይጨምሩ።', 'Ammaaf tarreen qabeenyaa hin jiru. Jalqabuuf qabeenya dabalaa.', 'ክሳብ ሕጂ ዝርዝር ንብረት የለን። ንምጅማር ንብረት ወስኹ።'],
  ['Pictures', 'ሥዕሎች', 'Suuraawwan', 'ስእልታት'],
  ['Add pictures', 'ሥዕሎች ጨምር', 'Suuraa dabali', 'ስእሊ ወስኽ'],
  ['Property pictures', 'የንብረት ሥዕሎች', 'Suuraa qabeenyaa', 'ስእሊ ንብረት'],
  ['No pictures have been added to this listing yet.', 'እስካሁን ለዚህ ዝርዝር ሥዕሎች አልተጨመሩም።', 'Ammaaf tarree kanaaf suuraan hin dabalamin.', 'ክሳብ ሕጂ ንዚ ዝርዝር ስእሊ ኣይተወሰኸን።'],
  ['Add listing pictures', 'የዝርዝር ሥዕሎች ጨምር', 'Suuraa tarree irratti dabali', 'ስእሊ ዝርዝር ወስኽ'],
  ['Choose pictures (JPEG or PNG, up to 10 MB each)', 'ሥዕሎችን ይምረጡ (JPEG ወይም PNG፣ እያንዳንዱ እስከ 10 ሜባ)', 'Suuraa filadhaa (JPEG yookaan PNG, tokkoon tokkoon hanga 10 MB)', 'ስእሊ ምረጹ (JPEG ወይ PNG፣ ነፍሲ ወከፍ ክሳብ 10 MB)'],
  ['Caption (optional)', 'መግለጫ (አማራጭ)', 'Ibsa gabaabaa (filannoo)', 'መግለጺ (ኣማራጺ)'],
  ['Upload pictures', 'ሥዕሎችን ጫን', 'Suuraa olkaa’i', 'ስእሊ ጽዓን'],
  ['Applicant KYC documents', 'የአመልካች KYC ሰነዶች', 'Sanadoota KYC kaadhimamaa', 'ሰነዳት KYC ኣመልካቲ'],
  ['The applicant has not uploaded any KYC documents.', 'አመልካቹ ምንም የKYC ሰነድ አልጫነም።', 'Kaadhimamaan sanada KYC tokkollee hin olkaa’in.', 'እቲ ኣመልካቲ ዝኾነ ሰነድ KYC ኣይጽዓነን።'],
  ['{{size}} · uploaded {{date}}', '{{size}} · የተጫነበት {{date}}', '{{size}} · guyyaa olkaa’ame {{date}}', '{{size}} · ዝተጸዓነሉ {{date}}'],
  ['Registration and KYC documents received. Compliance staff will review them before account activation.', 'የምዝገባ እና KYC ሰነዶች ደርሰዋል። መለያው ከመንቃቱ በፊት የተገዢነት ሠራተኞች ይገመግማሉ።', 'Galmeenii fi sanadoonni KYC fudhatamaniiru. Herregni hojii irra ooluu dura hojjettoonni to’annoo ni ilaalu.', 'ምዝገባን ሰነዳት KYCን ተቐቢልና። ቅድሚ ምንቃሕ ሕሳብ ሰራሕተኛታት ተገዢነት ክግምግምዎም እዮም።'],
  ['A registration is already pending. Upload the required documents to finish it.', 'ምዝገባ በሂደት ላይ ነው። ለማጠናቀቅ የሚፈለጉትን ሰነዶች ይጫኑ።', 'Galmeen duraan adeemsarra jira. Xumuruuf sanadoota barbaachisan olkaa’aa.', 'ምዝገባ ኣብ ምክያድ ኣሎ። ንምዝዛም ዝድለዩ ሰነዳት ጽዓኑ።'],
  ['Your registration is saved, but document upload needs attention: {{error}} Select the required files and submit again to retry.', 'ምዝገባዎ ተቀምጧል፣ ግን የሰነድ ጫና ችግር አለው፦ {{error}} እንደገና ለመሞከር የሚፈለጉትን ፋይሎች ይምረጡና ያስገቡ።', 'Galmeen keessan olkaa’ameera, garuu sanada olkaa’uun rakkoo qaba: {{error}} Irra deebi’uuf faayiloota barbaachisan filadhaa fi ergaa.', 'ምዝገባኹም ተዓቂቡ ኣሎ፣ ግን ምጽዓን ሰነድ ጸገም ኣለዎ: {{error}} ንምድጋም ዝድለዩ ፋይላት ምረጹን ኣቕርቡን።'],
  ['Property listing saved successfully.', 'የንብረት ዝርዝሩ በተሳካ ሁኔታ ተቀምጧል።', 'Tarreen qabeenyaa milkaa’inaan olkaa’ameera.', 'ዝርዝር ንብረት ብዓወት ተዓቂቡ።'],
  ['Property pictures uploaded successfully.', 'የንብረት ሥዕሎች በተሳካ ሁኔታ ተጭነዋል።', 'Suuraawwan qabeenyaa milkaa’inaan olkaa’aman.', 'ስእልታት ንብረት ብዓወት ተጸዒኖም።'],
  ['Property listing was saved, but picture upload failed: {{error}} Use Add pictures to retry.', 'የንብረት ዝርዝሩ ተቀምጧል፣ ግን ሥዕል መጫን አልተሳካም፦ {{error}} እንደገና ለመሞከር ሥዕሎች ጨምርን ይጠቀሙ።', 'Tarreen qabeenyaa olkaa’ameera, garuu suuraa olkaa’uun hin milkoofne: {{error}} Irra deebi’uuf Suuraa dabali fayyadamaa.', 'ዝርዝር ንብረት ተዓቂቡ፣ ግን ስእሊ ምጽዓን ኣይተሳኽዐን: {{error}} ንምድጋም ስእሊ ወስኽ ተጠቐሙ።'],
  ['Property pictures must be JPEG or PNG images.', 'የንብረት ሥዕሎች JPEG ወይም PNG መሆን አለባቸው።', 'Suuraawwan qabeenyaa JPEG yookaan PNG ta’uu qabu.', 'ስእልታት ንብረት JPEG ወይ PNG ክኾኑ ኣለዎም።'],
  ['Each property picture must be 10 MB or smaller.', 'እያንዳንዱ የንብረት ሥዕል 10 ሜባ ወይም ከዚያ በታች መሆን አለበት።', 'Tokkoon tokkoon suuraa qabeenyaa 10 MB yookaan isaa gadi ta’uu qaba.', 'ነፍሲ ወከፍ ስእሊ ንብረት 10 MB ወይ ካብኡ ንታሕቲ ክኸውን ኣለዎ።'],
  ['Choose at least one picture to upload.', 'ለመጫን ቢያንስ አንድ ሥዕል ይምረጡ።', 'Olkaa’uuf yoo xiqqaate suuraa tokko filadhaa.', 'ንምጽዓን እንተወሓደ ሓደ ስእሊ ምረጹ።'],
  ['Could not load a property picture ({{status}}).', 'የንብረት ሥዕል መጫን አልተቻለም ({{status}})።', 'Suuraa qabeenyaa fe’uun hin danda’amne ({{status}}).', 'ስእሊ ንብረት ምጽዓን ኣይተኻእለን ({{status}})።'],
  ['KYC documents', 'የKYC ሰነዶች', 'Sanadoota KYC', 'ሰነዳት KYC'],
  ['KYC document {{decision}}.', 'የKYC ሰነድ {{decision}}።', 'Sanadni KYC {{decision}}.', 'ሰነድ KYC {{decision}}።'],
  ['verify', 'አረጋግጥ', 'mirkaneessi', 'ኣረጋግጽ'],
  ['rejected', 'ውድቅ ተደርጓል', 'fudhatama dide', 'ተነጺጉ'],
  ['Select each required KYC document before submitting.', 'ከማስገባትዎ በፊት እያንዳንዱን የሚፈለግ KYC ሰነድ ይምረጡ።', 'Dura erguu sanada KYC barbaachisu hunda filadhaa.', 'ቅድሚ ምቕራብ ነፍሲ ወከፍ ዝድለ ሰነድ KYC ምረጹ።'],
  ['Registration succeeded but a secure document-upload token was not issued. Contact AfroLife support.', 'ምዝገባው ተሳክቷል ግን ደህንነቱ የተጠበቀ የሰነድ መጫኛ ቶከን አልተሰጠም። የAfroLife ድጋፍን ያነጋግሩ።', 'Galmeen milkaa’eera garuu mallattoon nageenya olkaa’insa sanadaa hin kennamne. Deeggarsa AfroLife qunnamaa.', 'ምዝገባ ተሳኺዑ ግን ውሑስ ምልክት ምጽዓን ሰነድ ኣይተዋህበን። ደገፍ AfroLife ርኸቡ።'],
  ['Document upload failed ({{status}})', 'ሰነድ መጫን አልተሳካም ({{status}})', 'Sanada olkaa’uun hin milkoofne ({{status}})', 'ሰነድ ምጽዓን ኣይተሳኽዐን ({{status}})'],
  ['Picture upload failed ({{status}})', 'ሥዕል መጫን አልተሳካም ({{status}})', 'Suuraa olkaa’uun hin milkoofne ({{status}})', 'ስእሊ ምጽዓን ኣይተሳኽዐን ({{status}})'],
  ['Download failed ({{status}})', 'ማውረድ አልተሳካም ({{status}})', 'Buusuun hin milkoofne ({{status}})', 'ምውራድ ኣይተሳኽዐን ({{status}})'],
];

const localeNames = { en: 'English', am: String.fromCodePoint(0x12a0,0x121b,0x122d,0x129b), om: 'Afaan Oromoo', ti: String.fromCodePoint(0x1275,0x130d,0x122d,0x129b), so: 'Soomaali', ar: String.fromCodePoint(0x627,0x644,0x639,0x631,0x628,0x64a,0x629), sw: 'Kiswahili' };
const catalogs = Object.fromEntries(Object.keys(localeNames).map((locale, column) => [
  locale,
  Object.fromEntries(rows.map((row) => [row[0], row[column]])),
]));
const addedLanguages = {
  am: {
    'Region': 'ክልል', 'City': 'ከተማ', 'Sub-city': 'ክፍለ ከተማ', 'Woreda': 'ወረዳ', 'Kebele': 'ቀበሌ', 'Territory': 'አካባቢ', 'Pro plan — ETB {{amount}} per month': 'ፕሮ ዕቅድ — ETB {{amount}} በወር', 'Enterprise plan — ETB {{amount}} per month': 'ኢንተርፕራይዝ ዕቅድ — ETB {{amount}} በወር', 'Install app': 'መተግበሪያውን ይጫኑ', 'Start typing an area name': 'የአካባቢውን ስም መጻፍ ይጀምሩ',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'የከተማ፣ ክፍለ ከተማ፣ ወረዳ ወይም ቀበሌ ስም ይጻፉና ተስማሚውን አማራጭ ይምረጡ።',
    'Choose a territory from the suggestions.': 'ከቀረቡት አማራጮች አካባቢ ይምረጡ።',
    'Free service': 'ነፃ አገልግሎት', 'Pro service': 'ፕሮ አገልግሎት', 'Enterprise service': 'ኢንተርፕራይዝ አገልግሎት',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'ለወኪሎችና ሻጮች ደንበኞችን፣ ሠራተኞችን፣ የአገልግሎት ጥያቄዎችንና ውሎችን የሚያስተዳድር መሠረታዊ አገልግሎት ነው። የንብረት ዝርዝር ማቅረብ አያካትትም።',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'የነፃ አገልግሎቱን ሁሉ ከንብረት ዝርዝር፣ ክፍሎች፣ የኪራይ ዝርዝሮችና ደህንነቱ በተጠበቀ የንብረት ፎቶ ጋር ያካትታል።',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'የፕሮ አገልግሎቱን ሁሉ ከቡድን ንብረት አስተዳደርና የአፈጻጸም ሪፖርት ጋር ያካትታል።',
    'Enterprise Option A staff service': 'የኢንተርፕራይዝ ኦፕሽን A የሠራተኛ አገልግሎት',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'የኦፕሽን A የኢንተርፕራይዝ የሥራ ምደባ ለሚፈልጉ ሠራተኞች ነው። ከመንቃቱ በፊት ምዝገባ፣ የአሠሪ ውል፣ የጡረታ ተዛማጅ መዋጮና የእድር ጥቅሞች መረጋገጥ አለባቸው።',
    'Team leads': 'የቡድን ደንበኞች', 'Team workers': 'የቡድን ሠራተኞች', 'Active contracts': 'ንቁ ውሎች', 'Property listings': 'የንብረት ዝርዝሮች',
    'Enterprise team and portfolio insights': 'የኢንተርፕራይዝ ቡድንና የንብረት ሪፖርት'
  },
  om: {
    'Region': 'Naannoo', 'City': 'Magaalaa', 'Sub-city': 'Kutaa magaalaa', 'Woreda': 'Aanaa', 'Kebele': 'Ganda', 'Territory': 'Naannoo', 'Pro plan — ETB {{amount}} per month': 'Karoora Pro — ETB {{amount}} jiʼatti', 'Enterprise plan — ETB {{amount}} per month': 'Karoora Enterprise — ETB {{amount}} jiʼatti', 'Install app': 'Appicha feʼi', 'Start typing an area name': 'Maqaa naannoo barreessuu jalqabaa',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'Maqaa magaalaa, kutaa magaalaa, aanaa yookaan ganda barreessaa, achiis yaada walsimu filadhaa.',
    'Choose a territory from the suggestions.': 'Yaadota keessaa naannoo filadhaa.',
    'Free service': 'Tajaajila bilisaa', 'Pro service': 'Tajaajila Pro', 'Enterprise service': 'Tajaajila Enterprise',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'Meeshaalee buʼuuraa bakka buʼaa fi gurgurtaaf: maamiltoota, hojjettoota, gaaffii tajaajilaa fi waliigaltee bulchuu. Tarreen qabeenyaa hin dabalamu.',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'Tajaajila Bilisaa hunda, dabalataan tarree qabeenyaa, kutaa, odeeffannoo kiraa fi suuraa qabeenyaa eegamaa qaba.',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'Tajaajila Pro hunda, dabalataan gabaasa qabeenyaa fi raawwii garee guutuu qaba.',
    'Enterprise Option A staff service': 'Tajaajila hojjetaa Enterprise Option A',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'Hojjettoota karaa tajaajila Enterprise keessatti hojii Option A barbaadaniif. Hojiitti galchuu dura galmeen, waliigalteen hojjechiisaa, qoodni penshinii fi faayidaan Edir mirkanaaʼuu qabu.',
    'Team leads': 'Maamiltoota garee', 'Team workers': 'Hojjettoota garee', 'Active contracts': 'Waliigalteewwan hojii irra jiran', 'Property listings': 'Tarreewwan qabeenyaa',
    'Enterprise team and portfolio insights': 'Gabaasa garee fi qabeenyaa Enterprise'
  },
  ti: {
    'Region': 'ክልል', 'City': 'ከተማ', 'Sub-city': 'ንኡስ ከተማ', 'Woreda': 'ወረዳ', 'Kebele': 'ቀበሌ', 'Territory': 'ከባቢ', 'Pro plan — ETB {{amount}} per month': 'ፕሮ ውጥን — ETB {{amount}} ኣብ ወርሒ', 'Enterprise plan — ETB {{amount}} per month': 'ኢንተርፕራይዝ ውጥን — ETB {{amount}} ኣብ ወርሒ', 'Install app': 'ኣፕ ጽዓን', 'Start typing an area name': 'ስም ከባቢ ምጽሓፍ ጀምሩ',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'ስም ከተማ፣ ንኡስ ከተማ፣ ወረዳ ወይ ቀበሌ ጽሓፉ፣ ድሕሪኡ ዝሰማማዕ ምርጫ ምረጹ።',
    'Choose a territory from the suggestions.': 'ካብቶም ምርጫታት ከባቢ ምረጹ።',
    'Free service': 'ነጻ ኣገልግሎት', 'Pro service': 'ፕሮ ኣገልግሎት', 'Enterprise service': 'ኢንተርፕራይዝ ኣገልግሎት',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'ንወከልቲን ሸየጥቲን መሰረታዊ መሳርሒታት፤ ዓማዊል፣ ሰራሕተኛታት፣ ሕቶታት ኣገልግሎትን ውዕላትን ምምሕዳር። ዝርዝር ንብረት ኣይካተትን።',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'ኩሉ ናይ ነጻ ኣገልግሎት ብተወሳኺ ዝርዝር ንብረት፣ ኣሃዱታት፣ ዝርዝር ክራይን ውሑስ ስእሊ ንብረትን የጠቓልል።',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'ኩሉ ናይ ፕሮ ኣገልግሎት ብተወሳኺ ሰፊሕ ዝርዝር ንብረትን ሪፖርት ውጽኢት ጉጅለን የጠቓልል።',
    'Enterprise Option A staff service': 'ኢንተርፕራይዝ ኣገልግሎት ሰራሕተኛ ኣማራጺ A',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'ኣብ ኢንተርፕራይዝ መንገዲ ኣማራጺ A ስራሕ ንዝደልዩ ሰራሕተኛታት። ቅድሚ ምጅማር ምዝገባ፣ ውዕል ኣስራሒ፣ መወሰኽታ ጡረታን ጥቕሚ እድርን ክረጋገጽ ኣለዎ።',
    'Team leads': 'ዓማዊል ጉጅለ', 'Team workers': 'ሰራሕተኛታት ጉጅለ', 'Active contracts': 'ንጡፋት ውዕላት', 'Property listings': 'ዝርዝር ንብረት',
    'Enterprise team and portfolio insights': 'ሪፖርት ጉጅለን ንብረትን ኢንተርፕራይዝ'
  },
  so: {
    'Region': 'Gobol', 'City': 'Magaalo', 'Sub-city': 'Xaafad', 'Woreda': 'Woreda', 'Kebele': 'Kebele', 'Territory': 'Deegaan', 'Pro plan — ETB {{amount}} per month': 'Qorshaha Pro — ETB {{amount}} bishii', 'Enterprise plan — ETB {{amount}} per month': 'Qorshaha Enterprise — ETB {{amount}} bishii', 'Sign out': 'Ka bax', 'AfroLife home': 'Bogga hore ee AfroLife', 'Language': 'Luqad', 'Install app': 'Ku rakib abka',
    'One trusted place to get work moving.': 'Hal meel oo la isku halayn karo oo shaqada lagu bilaabo.',
    'Coordinate leads, verified workers and service requests with clear ownership at every step.': 'Isku dubbarid macaamiisha, shaqaalaha la xaqiijiyey iyo codsiyada adeegga adigoo caddeynaya cidda masuulka ka ah tallaabo kasta.',
    'Verified workforce': 'Shaqaale la xaqiijiyey', 'Accountable agent network': 'Shabakad wakiillo lala xisaabtami karo', 'Central matching oversight': 'Kormeer dhexe oo isku-aadinta ah',
    'WORKER & COMMUNITY BENEFITS': 'FAA IIDOOYINKA SHAQAALAHA IYO BULSHADA', 'Build security together': 'Wadajir u dhisa ammaan dhaqaale',
    'Proposed 5% AfroLife match on eligible worker pension deposits.': 'AfroLife waxay soo jeedinaysaa inay ku darto 5% kaydka hawlgabka ee shaqaalaha u qalma.',
    'AfroLife Edir': 'Edir-ka AfroLife', 'Optional life cover': 'Caymis nololeed oo ikhtiyaari ah', 'Home protection': 'Ilaalinta guriga',
    'Open to Guaranteed Category A employees and AfroLife users, subject to program rules. Proposed ETB 2,000 joining fee + ETB 200 monthly for group accident and health cover.': 'Shaqaalaha Guaranteed Category A iyo isticmaalayaasha AfroLife way codsan karaan, sida waafaqsan xeerarka barnaamijka. Khidmadaha la soo jeediyey: ETB 2,000 gelitaanka iyo ETB 200 bishii oo loogu talagalay caymiska shilalka iyo caafimaadka kooxeed.',
    'ETB 5,000 annual contribution for proposed ETB 1 million cover for the member or spouse.': 'Lacag-bixin sanadle ah oo ETB 5,000 ah ayaa loogu talagalay caymiska la soo jeediyey ee ETB 1 milyan, xubinta ama lammaanaha.',
    'Tenants and property owners may request household fire, accidental damage and burglary cover for an additional ETB 200 premium.': 'Kiraystayaasha iyo mulkiilayaasha guryuhu waxay codsan karaan caymiska dabka, waxyeellada shilka iyo tuugada, qiime dheeraad ah oo ETB 200 ah halkii guri.',
    'Choose your interests during sign-up. No payment is taken and no match or insurance cover is active until AfroLife confirms eligibility, funding, insurer terms and a start date.': 'Dooro faa’iidooyinka aad xiisaynayso markaad isdiiwaangelinayso. Lacag lagama qaadayo, mana jiro gunno ama caymis shaqaynaya ilaa AfroLife xaqiijiso u-qalmitaanka, maalgelinta, shuruudaha caymis-bixiyaha iyo taariikhda bilowga.',
    'Apply to join AfroLife': 'Codso inaad ku biirto AfroLife', 'Welcome back': 'Soo dhawoow', 'Sign in': 'Gal', 'Sign up': 'Isdiiwaangeli',
    'Phone number': 'Lambarka telefoonka', 'Password': 'Furaha sirta ah', 'Full name': 'Magaca oo buuxa', 'Email (optional)': 'Iimayl (ikhtiyaari)',
    'Choose account type': 'Dooro nooca akoonka', 'I want to join as a worker': 'Waxaan doonayaa inaan ku biiro shaqaale ahaan',
    'I want to join as a buyer / customer': 'Waxaan doonayaa inaan ku biiro iibsade/macmiil ahaan',
    'I want to join as a seller / property owner': 'Waxaan doonayaa inaan ku biiro iibiye/mulkiile ahaan', 'I want to join as an agent': 'Waxaan doonayaa inaan ku biiro wakiil ahaan',
    'Your territory': 'Deegaankaaga', 'Start typing an area name': 'Bilow qorista magaca deegaanka',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'Qor magaalo, xaafad, woreda ama kebele, kadibna dooro soo-jeedin ku habboon.',
    'Choose a territory from the suggestions.': 'Ka dooro deegaanka liiska soo-jeedimaha.',
    'Benefit interests (no charge today)': 'Faa’iidooyinka aad xiisaynayso (maanta lacag lagama qaadayo)',
    'Worker pension match': 'Ku-darka kaydka hawlgabka shaqaalaha', 'Join AfroLife Edir': 'Ku biir Edir-ka AfroLife',
    'Add life cover': 'Ku dar caymis nololeed', 'Add household cover': 'Ku dar caymiska guriga',
    'These are non-binding requests for information. Selecting a benefit does not enroll you, collect money or start insurance coverage.': 'Kuwani waa codsiyo aan kugu waajibinayn oo xog-ogaalnimo ah. Doorashada faa’iido ma aha isdiiwaangelin, lacag-qaadis ama bilow caymis.',
    'Proposed ETB 2,000 joining fee and ETB 200 monthly for member group accident and health cover.': 'Khidmadaha la soo jeediyey waa ETB 2,000 gelitaanka iyo ETB 200 bishii oo loogu talagalay caymiska shilalka iyo caafimaadka kooxeed.',
    'Request the proposed 5% match on eligible pension deposits from income. Eligibility and payroll funding must be confirmed.': 'Codso ku-darka la soo jeediyey ee 5% ee kaydka hawlgabka ee dakhliga laga bixiyo. Waa in la xaqiijiyaa u-qalmitaanka iyo maalgelinta mushaharka.',
    'Proposed extra ETB 5,000 per year for ETB 1 million cover for the direct member or spouse; subject to insurer acceptance and policy terms.': 'Lacag dheeraad ah oo la soo jeediyey oo ETB 5,000 ah sannadkii si loo helo caymis ETB 1 milyan ah oo loogu talagalay xubinta ama lammaanaha; shirkadda caymiska iyo shuruudaha ayaa khuseeya.',
    'For tenants or property owners: proposed additional ETB 200 household premium for fire, accidental damage and burglary cover.': 'Kiraystayaasha ama mulkiilayaasha: lacag caymis guri oo dheeraad ah oo la soo jeediyey, ETB 200, dab, waxyeello shil iyo tuugo awgood.',
    'Plan choice is recorded as a request only. No payment will be collected or plan activated until billing is configured.': 'Doorashada qorshaha waxaa loo diiwaangelinayaa codsi keliya. Lacag lama qaadayo, qorshahana ma shaqaynayo ilaa lacag-bixinta la diyaariyo.',
    'Submit sign-up request': 'Gudbi codsiga isdiiwaangelinta', 'Already have an account? Sign in': 'Akoon ma leedahay? Gal',
    'Free service': 'Adeeg bilaash ah', 'Pro service': 'Adeegga Pro', 'Enterprise service': 'Adeegga Enterprise',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'Adeegyada aasaasiga ah ee wakiillada iyo iibiyeyaasha: maareynta macaamiisha, shaqaalaha, codsiyada adeegga iyo heshiisyada. Liisaska guryuhu kuma jiraan.',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'Wax kasta oo Bilaashka ah, oo lagu daray liisaska guryaha, qaybaha, faahfaahinta kirada iyo sawirro guri oo ammaan ah.',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'Wax kasta oo Pro ah, oo lagu daray aragti guud oo ku saabsan hantida iyo waxqabadka kooxda.',
    'Enterprise Option A staff service': 'Adeegga shaqaalaha Enterprise Option A',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'Shaqaalaha doonaya meelayn Option A oo leh adeegga Enterprise. Diiwaangelinta, shuruudaha loo-shaqeeyaha, kabka hawlgabka iyo faa’iidooyinka Edir waa in la xaqiijiyaa ka hor hawlgelinta.',
    'Team leads': 'Macaamiisha kooxda', 'Team workers': 'Shaqaalaha kooxda', 'Active contracts': 'Heshiisyada firfircoon', 'Property listings': 'Liisaska guryaha',
    'Enterprise team and portfolio insights': 'Aragtida kooxda iyo hantida Enterprise',
    'Free': 'Bilaash', 'Pro': 'Pro', 'Enterprise': 'Enterprise', 'Properties': 'Guryo', 'Workers': 'Shaqaale', 'Overview': 'Guudmar', 'Security': 'Amniga'
  },
  ar: {
    'Region': 'إقليم', 'City': 'مدينة', 'Sub-city': 'منطقة فرعية', 'Woreda': 'وردة', 'Kebele': 'كيبيلي', 'Territory': 'منطقة', 'Pro plan — ETB {{amount}} per month': 'خطة Pro — {{amount}} بر إثيوبي شهريًا', 'Enterprise plan — ETB {{amount}} per month': 'خطة Enterprise — {{amount}} بر إثيوبي شهريًا', 'Sign out': 'تسجيل الخروج', 'AfroLife home': 'الصفحة الرئيسية لأفرو لايف', 'Language': 'اللغة', 'Install app': 'تثبيت التطبيق',
    'One trusted place to get work moving.': 'مكان موثوق واحد لبدء العمل.',
    'Coordinate leads, verified workers and service requests with clear ownership at every step.': 'نسّق العملاء المحتملين والعمال المعتمدين وطلبات الخدمة مع وضوح المسؤولية في كل خطوة.',
    'Verified workforce': 'قوى عاملة تم التحقق منها', 'Accountable agent network': 'شبكة وكلاء خاضعة للمساءلة', 'Central matching oversight': 'إشراف مركزي على المطابقة',
    'WORKER & COMMUNITY BENEFITS': 'مزايا العمال والمجتمع', 'Build security together': 'نبني الأمان معًا',
    'Proposed 5% AfroLife match on eligible worker pension deposits.': 'مساهمة مطابقة مقترحة من أفرو لايف بنسبة 5٪ في إيداعات تقاعد العمال المؤهلين.',
    'AfroLife Edir': 'إدير أفرو لايف', 'Optional life cover': 'تأمين حياة اختياري', 'Home protection': 'حماية المنزل',
    'Open to Guaranteed Category A employees and AfroLife users, subject to program rules. Proposed ETB 2,000 joining fee + ETB 200 monthly for group accident and health cover.': 'متاح لموظفي الفئة المضمونة A ومستخدمي أفرو لايف وفقًا لقواعد البرنامج. الرسوم المقترحة: 2,000 بر إثيوبي للانضمام و200 بر شهريًا لتغطية جماعية للحوادث والصحة.',
    'ETB 5,000 annual contribution for proposed ETB 1 million cover for the member or spouse.': 'مساهمة سنوية مقترحة قدرها 5,000 بر إثيوبي لتغطية قدرها مليون بر للعضو أو الزوج أو الزوجة.',
    'Tenants and property owners may request household fire, accidental damage and burglary cover for an additional ETB 200 premium.': 'يمكن للمستأجرين ومالكي العقارات طلب تغطية للحريق والأضرار العرضية والسرقة المنزلية مقابل قسط إضافي قدره 200 بر إثيوبي لكل منزل.',
    'Choose your interests during sign-up. No payment is taken and no match or insurance cover is active until AfroLife confirms eligibility, funding, insurer terms and a start date.': 'اختر المزايا التي تهمك عند التسجيل. لن يتم تحصيل أي مبلغ ولن تبدأ المساهمة المطابقة أو التغطية التأمينية حتى تؤكد أفرو لايف الأهلية والتمويل وشروط شركة التأمين وتاريخ البدء.',
    'Apply to join AfroLife': 'قدّم طلب الانضمام إلى أفرو لايف', 'Welcome back': 'مرحبًا بعودتك', 'Sign in': 'تسجيل الدخول', 'Sign up': 'إنشاء حساب',
    'Phone number': 'رقم الهاتف', 'Password': 'كلمة المرور', 'Full name': 'الاسم الكامل', 'Email (optional)': 'البريد الإلكتروني (اختياري)',
    'Choose account type': 'اختر نوع الحساب', 'I want to join as a worker': 'أرغب في الانضمام كعامل',
    'I want to join as a buyer / customer': 'أرغب في الانضمام كمشترٍ / عميل',
    'I want to join as a seller / property owner': 'أرغب في الانضمام كبائع / مالك عقار', 'I want to join as an agent': 'أرغب في الانضمام كوكيل',
    'Your territory': 'منطقتك', 'Start typing an area name': 'ابدأ بكتابة اسم المنطقة',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'اكتب اسم مدينة أو منطقة فرعية أو وريدا أو كيبيلي، ثم اختر الاقتراح المطابق.',
    'Choose a territory from the suggestions.': 'اختر منطقة من الاقتراحات.',
    'Benefit interests (no charge today)': 'المزايا التي تهمك (دون رسوم اليوم)',
    'Worker pension match': 'مساهمة مطابقة لتقاعد العامل', 'Join AfroLife Edir': 'الانضمام إلى إدير أفرو لايف',
    'Add life cover': 'إضافة تأمين على الحياة', 'Add household cover': 'إضافة تغطية منزلية',
    'These are non-binding requests for information. Selecting a benefit does not enroll you, collect money or start insurance coverage.': 'هذه طلبات غير ملزمة للحصول على معلومات. اختيار ميزة لا يعني التسجيل أو تحصيل الأموال أو بدء التغطية التأمينية.',
    'Proposed ETB 2,000 joining fee and ETB 200 monthly for member group accident and health cover.': 'الرسوم المقترحة: 2,000 بر إثيوبي للانضمام و200 بر شهريًا للتغطية الجماعية للحوادث والصحة.',
    'Request the proposed 5% match on eligible pension deposits from income. Eligibility and payroll funding must be confirmed.': 'اطلب المساهمة المطابقة المقترحة بنسبة 5٪ في إيداعات التقاعد المؤهلة من الدخل. يجب تأكيد الأهلية وتمويل الرواتب.',
    'Proposed extra ETB 5,000 per year for ETB 1 million cover for the direct member or spouse; subject to insurer acceptance and policy terms.': 'مساهمة إضافية مقترحة قدرها 5,000 بر سنويًا لتغطية بقيمة مليون بر للعضو المباشر أو الزوج أو الزوجة، وذلك وفق قبول شركة التأمين وشروط الوثيقة.',
    'For tenants or property owners: proposed additional ETB 200 household premium for fire, accidental damage and burglary cover.': 'للمستأجرين أو مالكي العقارات: قسط منزلي إضافي مقترح قدره 200 بر لتغطية الحريق والأضرار العرضية والسطو.',
    'Plan choice is recorded as a request only. No payment will be collected or plan activated until billing is configured.': 'يُسجّل اختيار الخطة كطلب فقط. لن يتم تحصيل أي مبلغ أو تفعيل الخطة حتى يتم إعداد الفوترة.',
    'Submit sign-up request': 'إرسال طلب التسجيل', 'Already have an account? Sign in': 'لديك حساب بالفعل؟ سجّل الدخول',
    'Free service': 'الخدمة المجانية', 'Pro service': 'خدمة برو', 'Enterprise service': 'خدمة المؤسسات',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'أدوات الوكلاء والبائعين الأساسية لإدارة العملاء والعمال وطلبات الخدمة والعقود. لا تشمل إدراج العقارات.',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'كل مزايا المجاني، بالإضافة إلى إدراج العقارات والوحدات وتفاصيل الإيجار وصور العقارات الآمنة.',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'كل مزايا برو، بالإضافة إلى رؤى محفظة الفريق وأدائه.',
    'Enterprise Option A staff service': 'خدمة موظفي المؤسسات، الخيار A',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'للعمال الراغبين في تعيين الخيار A ضمن مسار خدمة المؤسسات. يجب تأكيد التسجيل وشروط صاحب العمل ومساهمة التقاعد ومزايا إدير قبل التفعيل.',
    'Team leads': 'عملاء الفريق', 'Team workers': 'عمال الفريق', 'Active contracts': 'العقود النشطة', 'Property listings': 'إدراجات العقارات',
    'Enterprise team and portfolio insights': 'رؤى فريق المؤسسات ومحفظته',
    'Free': 'مجاني', 'Pro': 'احترافي', 'Enterprise': 'مؤسسات', 'Properties': 'العقارات', 'Workers': 'العمال', 'Overview': 'نظرة عامة', 'Security': 'الأمان'
  },
  sw: {
    'Sign out': 'Toka', 'AfroLife home': 'Ukurasa wa mwanzo wa AfroLife', 'Language': 'Lugha', 'Install app': 'Sakinisha programu',
    'One trusted place to get work moving.': 'Mahali pa kuaminika pa kuanzisha kazi.',
    'Coordinate leads, verified workers and service requests with clear ownership at every step.': 'Ratibu wateja watarajiwa, wafanyakazi waliothibitishwa na maombi ya huduma huku wajibu ukiwa wazi katika kila hatua.',
    'Verified workforce': 'Wafanyakazi waliothibitishwa', 'Accountable agent network': 'Mtandao wa mawakala unaowajibika', 'Central matching oversight': 'Usimamizi mkuu wa ulinganishaji',
    'WORKER & COMMUNITY BENEFITS': 'FAIDA KWA WAFANYAKAZI NA JAMII', 'Build security together': 'Jenga usalama pamoja',
    'Proposed 5% AfroLife match on eligible worker pension deposits.': 'AfroLife inapendekeza kuongeza mchango wa 5% kwenye akiba ya pensheni ya wafanyakazi wanaostahili.',
    'AfroLife Edir': 'Edir ya AfroLife', 'Optional life cover': 'Bima ya maisha ya hiari', 'Home protection': 'Ulinzi wa nyumba',
    'Open to Guaranteed Category A employees and AfroLife users, subject to program rules. Proposed ETB 2,000 joining fee + ETB 200 monthly for group accident and health cover.': 'Wafanyakazi wa Guaranteed Category A na watumiaji wa AfroLife wanaweza kuomba kulingana na masharti ya mpango. Ada zinazopendekezwa: ETB 2,000 ya kujiunga na ETB 200 kila mwezi kwa bima ya pamoja ya ajali na afya.',
    'ETB 5,000 annual contribution for proposed ETB 1 million cover for the member or spouse.': 'Mchango wa mwaka wa ETB 5,000 unapendekezwa kwa bima ya ETB milioni 1 kwa mwanachama au mwenzi.',
    'Tenants and property owners may request household fire, accidental damage and burglary cover for an additional ETB 200 premium.': 'Wapangaji na wamiliki wa nyumba wanaweza kuomba bima ya moto, uharibifu wa bahati mbaya na wizi kwa ada ya ziada ya ETB 200 kwa kila nyumba.',
    'Choose your interests during sign-up. No payment is taken and no match or insurance cover is active until AfroLife confirms eligibility, funding, insurer terms and a start date.': 'Chagua unachopendelea unapojisajili. Hakuna malipo yanayochukuliwa wala mchango unaolinganishwa au bima inayoanza hadi AfroLife ithibitishe ustahiki, ufadhili, masharti ya bima na tarehe ya kuanza.',
    'Apply to join AfroLife': 'Omba kujiunga na AfroLife', 'Welcome back': 'Karibu tena', 'Sign in': 'Ingia', 'Sign up': 'Jisajili',
    'Phone number': 'Nambari ya simu', 'Password': 'Nenosiri', 'Full name': 'Jina kamili', 'Email (optional)': 'Barua pepe (si lazima)',
    'Choose account type': 'Chagua aina ya akaunti', 'I want to join as a worker': 'Ninataka kujiunga kama mfanyakazi',
    'I want to join as a buyer / customer': 'Ninataka kujiunga kama mnunuzi / mteja',
    'I want to join as a seller / property owner': 'Ninataka kujiunga kama muuzaji / mmiliki wa nyumba', 'I want to join as an agent': 'Ninataka kujiunga kama wakala',
    'Your territory': 'Eneo lako', 'Start typing an area name': 'Anza kuandika jina la eneo',
    'Type a city, sub-city, woreda, or kebele, then choose a matching suggestion.': 'Andika jina la jiji, kitongoji, woreda au kebele, kisha uchague pendekezo linalolingana.',
    'Choose a territory from the suggestions.': 'Chagua eneo kutoka kwenye mapendekezo.',
    'Benefit interests (no charge today)': 'Faida unazopendelea (hakuna malipo leo)',
    'Worker pension match': 'Mchango linganifu wa pensheni ya mfanyakazi', 'Join AfroLife Edir': 'Jiunge na Edir ya AfroLife',
    'Add life cover': 'Ongeza bima ya maisha', 'Add household cover': 'Ongeza bima ya nyumba',
    'These are non-binding requests for information. Selecting a benefit does not enroll you, collect money or start insurance coverage.': 'Haya ni maombi ya taarifa yasiyokufunga. Kuchagua faida hakukusajili, hakuchukui pesa wala kuanzisha bima.',
    'Proposed ETB 2,000 joining fee and ETB 200 monthly for member group accident and health cover.': 'Ada zinazopendekezwa ni ETB 2,000 ya kujiunga na ETB 200 kila mwezi kwa bima ya pamoja ya ajali na afya ya mwanachama.',
    'Request the proposed 5% match on eligible pension deposits from income. Eligibility and payroll funding must be confirmed.': 'Omba mchango linganifu wa 5% unaopendekezwa kwa akiba ya pensheni inayostahili kutoka kwenye mapato. Ustahiki na ufadhili wa mishahara lazima uthibitishwe.',
    'Proposed extra ETB 5,000 per year for ETB 1 million cover for the direct member or spouse; subject to insurer acceptance and policy terms.': 'ETB 5,000 ya ziada inapendekezwa kila mwaka kwa bima ya ETB milioni 1 kwa mwanachama au mwenzi; kwa idhini ya mtoa bima na masharti ya sera.',
    'For tenants or property owners: proposed additional ETB 200 household premium for fire, accidental damage and burglary cover.': 'Kwa wapangaji au wamiliki wa nyumba: ada ya ziada ya bima ya nyumba ya ETB 200 inapendekezwa kwa moto, uharibifu wa bahati mbaya na wizi.',
    'Plan choice is recorded as a request only. No payment will be collected or plan activated until billing is configured.': 'Chaguo la mpango hurekodiwa kama ombi tu. Hakuna malipo yatakayochukuliwa wala mpango kuanza hadi mfumo wa malipo utakapoandaliwa.',
    'Submit sign-up request': 'Tuma ombi la usajili', 'Already have an account? Sign in': 'Tayari una akaunti? Ingia',
    'Free service': 'Huduma ya bure', 'Pro service': 'Huduma ya Pro', 'Enterprise service': 'Huduma ya Enterprise',
    'Core agent and seller tools for leads, workers, service requests and contracts. Property listings are not included.': 'Zana za msingi za mawakala na wauzaji za kusimamia wateja, wafanyakazi, maombi ya huduma na mikataba. Orodha za nyumba hazijajumuishwa.',
    'Everything in Free, plus property listings, units, rent details and secure property photos.': 'Kila kitu cha Bure, pamoja na orodha za nyumba, vitengo, maelezo ya kodi na picha salama za mali.',
    'Everything in Pro, plus team-wide portfolio and performance insights.': 'Kila kitu cha Pro, pamoja na muhtasari wa mali na utendaji wa timu nzima.',
    'Enterprise Option A staff service': 'Huduma ya wafanyakazi ya Enterprise Chaguo A',
    'For workers seeking an Option A placement with the Enterprise service pathway. Enrollment, employer terms, pension matching and Edir benefits require confirmation before activation.': 'Kwa wafanyakazi wanaotafuta ajira ya Chaguo A kupitia huduma ya Enterprise. Usajili, masharti ya mwajiri, mchango linganifu wa pensheni na faida za Edir lazima zithibitishwe kabla ya kuwezesha.',
    'Team leads': 'Wateja wa timu', 'Team workers': 'Wafanyakazi wa timu', 'Active contracts': 'Mikataba inayotumika', 'Property listings': 'Orodha za mali',
    'Enterprise team and portfolio insights': 'Muhtasari wa timu na mali wa Enterprise',
    'Free': 'Bure', 'Pro': 'Pro', 'Enterprise': 'Biashara', 'Properties': 'Nyumba na mali', 'Workers': 'Wafanyakazi', 'Overview': 'Muhtasari', 'Security': 'Usalama'
  }
};
const planCopy = {
  am: ['ለእርስዎ ሚና የሚገኙ የAfroLife መሠረታዊ መሣሪያዎች፦ ደንበኞች፣ ሠራተኞች፣ ጥያቄዎች፣ ውሎች እና ዝርዝሮች።', 'የPro ዕቅድ ጥያቄ ብቻ ነው። ለወደፊት የሚከፈሉ አገልግሎቶች የክፍያ ሥርዓትና ማግበር ይፈልጋሉ።', 'የEnterprise ዕቅድ ጥያቄ ብቻ ነው። የቡድን ሪፖርት ክፍያና ማግበር እስኪዘጋጅ ድረስ አይሠራም።'],
  om: ['Meeshaalee AfroLife gahee keessaniif jiran: maamiltoota, hojjettoota, gaaffii, waliigaltee fi tarreeffama.', 'Karoora Pro filachuun gaaffii qofa. Tajaajilli kaffaltii gara fuulduraa kaffaltii fi hojii irra oolchuu barbaada.', 'Karoora Enterprise filachuun gaaffii qofa. Gabaasni garee hanga kaffaltii fi hojii irra oolutti hin jiru.'],
  ti: ['ን ሓላፍነትኩም ዝምልከቱ መሰረታዊ መሳርሒታት AfroLife፦ ዓማዊል፣ ሰራሕተኛታት፣ ሕቶታት፣ ውዕላትን ዝርዝራትን።', 'መደብ Pro ሕቶ ጥራይ እዩ። ናይ መጻኢ ዝኽፈሉ ኣገልግሎታት ክፍሊትን ምንቃሕን ይጠልቡ።', 'መደብ Enterprise ሕቶ ጥራይ እዩ። ሪፖርት ጉጅለ ክፍሊትን ምንቃሕን ክሳብ ዝዳሎ ኣይሰርሕን።'],
  so: ['Qalabka AfroLife ee doorkaaga: macaamiil, shaqaale, codsiyo, heshiisyo iyo liisaska.', 'Pro waa codsi qorshe oo keliya. Adeegyada lacagta leh ee mustaqbalka waxay u baahan yihiin lacag-bixin iyo hawlgelin.', 'Enterprise waa codsi qorshe oo keliya. Warbixinta kooxda ma shaqaynayso ilaa lacag-bixin iyo hawlgelin la diyaariyo.'],
  ar: ['أدوات AfroLife المتاحة لدورك: العملاء والعمال والطلبات والعقود والقوائم.', 'اختيار Pro طلب فقط. الميزات المدفوعة مستقبلًا تحتاج إلى إعداد الدفع والتفعيل.', 'اختيار Enterprise طلب فقط. تقارير الفريق غير متاحة حتى إعداد الدفع والتفعيل.'],
  sw: ['Zana za AfroLife za jukumu lako: wateja, wafanyakazi, maombi, mikataba na matangazo.', 'Pro ni ombi la mpango tu. Huduma za kulipia za baadaye zinahitaji malipo na kuwezeshwa.', 'Enterprise ni ombi la mpango tu. Ripoti za timu hazipatikani hadi malipo na kuwezeshwa viandaliwe.'],
};
for (const [locale, [free, pro, enterprise]] of Object.entries(planCopy)) {
  addedLanguages[locale]['Core AfroLife tools for your role, including lead, worker, request, contract and listing workflows.'] = free;
  addedLanguages[locale]['Pro is a plan request only. Future paid features require billing and activation.'] = pro;
  addedLanguages[locale]['Enterprise is a plan request only. Team reporting is not active until billing and activation are configured.'] = enterprise;
  Object.assign(catalogs[locale], addedLanguages[locale]);
}
addedLanguages.sw['Region'] = 'Mkoa'; addedLanguages.sw['City'] = 'Jiji'; addedLanguages.sw['Sub-city'] = 'Sehemu ya jiji'; addedLanguages.sw['Woreda'] = 'Woreda'; addedLanguages.sw['Kebele'] = 'Kebele'; addedLanguages.sw['Territory'] = 'Eneo';
addedLanguages.sw['Pro plan — ETB {{amount}} per month'] = 'Mpango wa Pro — ETB {{amount}} kwa mwezi';
addedLanguages.sw['Enterprise plan — ETB {{amount}} per month'] = 'Mpango wa Enterprise — ETB {{amount}} kwa mwezi';for (const [locale, messages] of Object.entries(addedLanguages)) Object.assign(catalogs[locale], messages);
const publicSurfaceTranslations = {
  'Skip to content': {
    am: 'ወደ ይዘቱ ይሂዱ', om: 'Gara qabiyyeetti darbi', ti: 'ናብ ትሕዝቶ ዝለል', so: 'U bood nuxurka', ar: 'انتقل إلى المحتوى', sw: 'Ruka hadi kwenye maudhui',
  },
  'Language': {
    am: 'ቋንቋ', om: 'Afaan', ti: 'ቋንቋ', so: 'Luqad', ar: 'اللغة', sw: 'Lugha',
  },
  'Install app': {
    am: 'መተግበሪያውን ይጫኑ', om: 'Appii fe’i', ti: 'መተግበሪ ጽዓን', so: 'Ku rakib abka', ar: 'تثبيت التطبيق', sw: 'Sakinisha programu',
  },
  'ETHIOLIFE REGISTRATION': {
    am: 'የETHIOLIFE ምዝገባ', om: 'Galmee ETHIOLIFE', ti: 'ምዝገባ ETHIOLIFE', so: 'Diiwaangelinta ETHIOLIFE', ar: 'تسجيل ETHIOLIFE', sw: 'Usajili wa ETHIOLIFE',
  },
  'Staff approval is required before sign-in. Your account will remain inactive until compliance review and activation are complete.': {
    am: 'ከመግባትዎ በፊት የሠራተኛ ፈቃድ ያስፈልጋል። የተገዢነት ግምገማና ማግበር እስኪጠናቀቁ ድረስ መለያዎ ንቁ አይሆንም።',
    om: 'Seenuun dura hayyamni hojjettootaa barbaachisa. Gamaaggamni fi hojii irra ooluun hamma xumuramutti herregni keessan hin hojjetu.',
    ti: 'ቅድሚ ምእታው ፍቓድ ሰራሕተኛ የድሊ። ግምገማን ምንቃሕን ክሳብ ዝውድኡ ሕሳብኩም ኣይንቀሳቐስን።',
    so: 'Oggolaanshaha shaqaalaha ayaa loo baahan yahay ka hor gelitaanka. Akoonkaagu ma shaqayn doono ilaa dib-u-eegista iyo hawlgelintu dhammaadaan.',
    ar: 'تُشترط موافقة الموظفين قبل تسجيل الدخول. سيظل حسابك غير نشط حتى اكتمال المراجعة والتفعيل.',
    sw: 'Idhini ya wafanyakazi inahitajika kabla ya kuingia. Akaunti yako haitatumika hadi ukaguzi na kuwezesha vikamilike.',
  },
  'Full name': {
    am: 'ሙሉ ስም', om: 'Maqaa guutuu', ti: 'ምሉእ ስም', so: 'Magaca oo buuxa', ar: 'الاسم الكامل', sw: 'Jina kamili',
  },
  'Email (optional)': {
    am: 'ኢሜይል (አማራጭ)', om: 'Imeelii (filannoo)', ti: 'ኢሜይል (ኣማራጺ)', so: 'Iimayl (ikhtiyaari)', ar: 'البريد الإلكتروني (اختياري)', sw: 'Barua pepe (hiari)',
  },
  'Password confirmation': {
    am: 'የይለፍ ቃል ማረጋገጫ', om: 'Mirkaneessa jecha icciitii', ti: 'ምርግጋጽ መሕለፊ ቃል', so: 'Xaqiijinta erayga sirta', ar: 'تأكيد كلمة المرور', sw: 'Thibitisha nenosiri',
  },
  'Select an account type': {
    am: 'የመለያ ዓይነት ይምረጡ', om: 'Gosa herregaa filadhaa', ti: 'ዓይነት ሕሳብ ምረጹ', so: 'Dooro nooca akoontiga', ar: 'اختر نوع الحساب', sw: 'Chagua aina ya akaunti',
  },
  'Service interests (no charge today)': {
    am: 'የአገልግሎት ፍላጎቶች (ዛሬ ክፍያ የለም)', om: 'Fedhii tajaajilaa (har’a kaffaltiin hin jiru)', ti: 'ፍላጎታት ኣገልግሎት (ሎሚ ክፍሊት የለን)', so: 'Adeegyada aad danaynayso (maanta lacag ma jirto)', ar: 'الخدمات التي تهمك (لا توجد رسوم اليوم)', sw: 'Huduma unazopendelea (hakuna malipo leo)',
  },
  'Request AfroLife Edir membership': {
    am: 'የAfroLife እድር አባልነት ይጠይቁ', om: 'Miseensummaa Edir AfroLife gaafadhaa', ti: 'ኣባልነት Edir AfroLife ሕተቱ', so: 'Codso xubinnimada AfroLife Edir', ar: 'اطلب عضوية إدير في AfroLife', sw: 'Omba uanachama wa AfroLife Edir',
  },
  'After KYC verification, you can review the currently available community and financial products before requesting enrollment.': {
    am: 'ከKYC ማረጋገጫ በኋላ ምዝገባ ከመጠየቅዎ በፊት ያሉትን የማህበረሰብና የፋይናንስ ምርቶች ማየት ይችላሉ።',
    om: 'Mirkaneessa KYC booda, galmee gaafachuu dura oomisha hawaasummaa fi faayinaansii yeroo ammaa jiran ilaaluu dandeessu.',
    ti: 'ድሕሪ ምርግጋጽ KYC፡ ኣባልነት ቅድሚ ምሕታትኩም ኣብዚ ግዜ ዘለዉ ማሕበረሰባዊን ፋይናንሳዊን ፍርያት ክትርእዩ ትኽእሉ።',
    so: 'Kadib xaqiijinta KYC, waxaad eegi kartaa adeegyada bulshada iyo maaliyadda ee hadda jira ka hor codsiga xubinnimada.',
    ar: 'بعد التحقق من KYC، يمكنك مراجعة منتجات المجتمع والمنتجات المالية المتاحة حاليًا قبل طلب الانضمام.',
    sw: 'Baada ya uthibitishaji wa KYC, unaweza kukagua huduma za jamii na bidhaa za kifedha zilizopo kabla ya kuomba kujiunga.',
  },
  'Identity documents': {
    am: 'የመታወቂያ ሰነዶች', om: 'Sanadoota eenyummaa', ti: 'ሰነዳት መንነት', so: 'Dukumentiyada aqoonsiga', ar: 'وثائق الهوية', sw: 'Nyaraka za utambulisho',
  },
  'Choose an account type to see required documents.': {
    am: 'የሚፈለጉ ሰነዶችን ለማየት የመለያ ዓይነት ይምረጡ።', om: 'Sanadoota barbaachisan arguuf gosa herregaa filadhaa.', ti: 'ዝድለዩ ሰነዳት ንምርኣይ ዓይነት ሕሳብ ምረጹ።', so: 'Dooro nooca akoontiga si aad u aragto dukumentiyada loo baahan yahay.', ar: 'اختر نوع الحساب لعرض الوثائق المطلوبة.', sw: 'Chagua aina ya akaunti ili kuona nyaraka zinazohitajika.',
  },
  'Required documents: {{documents}}. Upload PDF, JPEG or PNG files up to 10 MB each.': {
    am: 'የሚፈለጉ ሰነዶች፦ {{documents}}። እስከ 10 MB የሆነ PDF፣ JPEG ወይም PNG ይጫኑ።',
    om: 'Sanadoota barbaachisan: {{documents}}. Faayiloota PDF, JPEG yookaan PNG hanga 10 MB olkaa’aa.',
    ti: 'ዝድለዩ ሰነዳት፦ {{documents}}። PDF፣ JPEG ወይ PNG ክሳብ 10 MB ጽዓኑ።',
    so: 'Dukumentiyada loo baahan yahay: {{documents}}. Soo geli PDF, JPEG ama PNG aan ka badnayn 10 MB.',
    ar: 'الوثائق المطلوبة: {{documents}}. ارفع ملف PDF أو JPEG أو PNG بحجم لا يتجاوز 10 ميغابايت.',
    sw: 'Nyaraka zinazohitajika: {{documents}}. Pakia PDF, JPEG au PNG isiyozidi MB 10.',
  },
  'Could not confirm document requirements for this account type. Please retry loading signup requirements.': {
    am: 'ለዚህ የመለያ ዓይነት የሰነድ መስፈርቶችን ማረጋገጥ አልተቻለም። የምዝገባ መስፈርቶችን እንደገና ይጫኑ።',
    om: 'Ulaagaalee sanadaa gosa herregaa kanaaf mirkaneessuun hin danda’amne. Ulaagaalee galmee irra deebi’anii fe’aa.',
    ti: 'መስፈርታት ሰነድ ናይዚ ዓይነት ሕሳብ ምርግጋጽ ኣይተኻእለን። መስፈርታት ምዝገባ እንደገና ጽዓኑ።',
    so: 'Lama xaqiijin karo shuruudaha dukumentiga noocan akoontiga. Mar kale soo rar shuruudaha diiwaangelinta.',
    ar: 'تعذر تأكيد متطلبات الوثائق لهذا النوع من الحساب. أعد تحميل متطلبات التسجيل.',
    sw: 'Haikuwezekana kuthibitisha mahitaji ya nyaraka kwa aina hii ya akaunti. Pakia tena mahitaji ya usajili.',
  },
  'Choose a territory from the suggestions.': {
    am: 'ከቀረቡት አማራጮች አካባቢ ይምረጡ።', om: 'Yaada dhiyaate keessaa naannoo filadhaa.', ti: 'ካብ ዝቐረቡ ምርጫታት ከባቢ ምረጹ።', so: 'Ka dooro deegaanada la soo jeediyay.', ar: 'اختر منطقة من الاقتراحات.', sw: 'Chagua eneo kutoka kwenye mapendekezo.',
  },
  'Join AfroLife Edir': {
    am: 'AfroLife Edirን ይቀላቀሉ', om: 'AfroLife Edir waliin makamaa', ti: 'AfroLife Edir ተጸንበሩ', so: 'Ku biir AfroLife Edir', ar: 'انضم إلى AfroLife Edir', sw: 'Jiunge na AfroLife Edir',
  },
  'Register an Edir': {
    am: 'እድር ይመዝግቡ', om: 'Edir galmeessaa', ti: 'Edir መዝግቡ', so: 'Diiwaangeli Edir', ar: 'سجّل إدير', sw: 'Sajili Edir',
  },
  'EDIR ONBOARDING': {
    am: 'የእድር ምዝገባ', om: 'Galmee Edir', ti: 'ምዝገባ Edir', so: 'Diiwaangelinta Edir', ar: 'تسجيل إدير', sw: 'Usajili wa Edir',
  },
  'Apply to register an independent Edir': {
    am: 'ገለልተኛ እድር ለመመዝገብ ያመልክቱ', om: 'Edir of danda’e galmeessuuf iyyadhaa', ti: 'ናጻ Edir ንምምዝጋብ ኣመልክቱ', so: 'Codso diiwaangelinta Edir madax-bannaan', ar: 'قدّم طلب تسجيل إدير مستقل', sw: 'Omba kusajili Edir huru',
  },
  'The umbrella Master Edir reviews applications. If approved, your Edir keeps its own governance, administration, and operational records.': {
    am: 'ዋናው የእድር ማህበር ማመልከቻዎችን ይገመግማል። ከተፈቀደ፣ እድርዎ የራሱን አስተዳደር፣ ሥራ አመራርና የሥራ መዝገቦች ይይዛል።',
    om: 'Edir guddaan iyyannoowwan ni gamaaggama. Yoo ragga’e, Edir keessan bulchiinsa, hooggansa fi galmeewwan hojii mataa isaa qabaata.',
    ti: 'ዋና Edir ነቶም መመልከቲታት ይግምግሞም። እንተተፈቒዱ፡ Edirኩም ናይ ገዛእ ርእሱ ምምሕዳር፣ ኣሰራርሓን መዝገባትን ይዕቅብ።',
    so: 'Edir-ka guud ayaa dib u eegaya codsiyada. Haddii la oggolaado, Edir-kaagu wuxuu yeelanayaa maamul iyo diiwaanno u gaar ah.',
    ar: 'يراجع إدير الرئيسي الطلبات. وإذا تمت الموافقة، يحتفظ إدير الخاص بك بحوكمته وإدارته وسجلاته التشغيلية المستقلة.',
    sw: 'Edir Kuu inakagua maombi. Ikiidhinishwa, Edir yako itahifadhi utawala, usimamizi na kumbukumbu zake yenyewe.',
  },
  'Edir display name': {
    am: 'የእድር ማሳያ ስም', om: 'Maqaa Edir agarsiisaa', ti: 'ስም መርኣያ Edir', so: 'Magaca Edir ee la muujinayo', ar: 'اسم إدير المعروض', sw: 'Jina la Edir litakaloonekana',
  },
  'Legal name': {
    am: 'ሕጋዊ ስም', om: 'Maqaa seeraa', ti: 'ሕጋዊ ስም', so: 'Magaca sharciga ah', ar: 'الاسم القانوني', sw: 'Jina la kisheria',
  },
  'Registration reference (optional)': {
    am: 'የምዝገባ ማጣቀሻ (አማራጭ)', om: 'Wabii galmee (filannoo)', ti: 'መወከሲ ምዝገባ (ኣማራጺ)', so: 'Tixraaca diiwaangelinta (ikhtiyaari)', ar: 'مرجع التسجيل (اختياري)', sw: 'Nambari ya usajili (hiari)',
  },
  'Bylaws or governance reference (optional)': {
    am: 'የደንብ ወይም የአስተዳደር ማጣቀሻ (አማራጭ)', om: 'Wabii dambii yookaan bulchiinsaa (filannoo)', ti: 'መወከሲ ደንቢ ወይ ምምሕዳር (ኣማራጺ)', so: 'Tixraaca xeer-hoosaadka ama maamulka (ikhtiyaari)', ar: 'مرجع اللوائح أو الحوكمة (اختياري)', sw: 'Rejea ya katiba au utawala (hiari)',
  },
  'Contact person': {
    am: 'የመገናኛ ሰው', om: 'Nama qunnamtii', ti: 'ሰብ ርክብ', so: 'Qofka lala xiriirayo', ar: 'الشخص المسؤول للتواصل', sw: 'Mtu wa mawasiliano',
  },
  'Contact phone': {
    am: 'የመገናኛ ስልክ', om: 'Bilbila qunnamtii', ti: 'ስልኪ ርክብ', so: 'Telefoonka xiriirka', ar: 'هاتف التواصل', sw: 'Simu ya mawasiliano',
  },
  'Official legal registration certificate (PDF, JPEG or PNG · max 10 MB)': {
    am: 'ኦፊሴላዊ የሕጋዊ ምዝገባ ማረጋገጫ (PDF, JPEG ወይም PNG · እስከ 10 MB)',
    om: 'Ragaa galmee seeraa ofiishaalaa (PDF, JPEG yookaan PNG · hanga 10 MB)',
    ti: 'ወግዓዊ ሕጋዊ ምስክር ወረቐት ምዝገባ (PDF፣ JPEG ወይ PNG · ክሳብ 10 MB)',
    so: 'Shahaadada rasmiga ah ee diiwaangelinta sharciga (PDF, JPEG ama PNG · ugu badnaan 10 MB)',
    ar: 'شهادة التسجيل القانوني الرسمية (PDF أو JPEG أو PNG · بحد أقصى 10 ميغابايت)',
    sw: 'Cheti rasmi cha usajili wa kisheria (PDF, JPEG au PNG · hadi MB 10)',
  },
  'Governance or bylaws document (PDF, JPEG or PNG · max 10 MB)': {
    am: 'የአስተዳደር ወይም የደንብ ሰነድ (PDF, JPEG ወይም PNG · እስከ 10 MB)',
    om: 'Sanada bulchiinsaa yookaan dambii (PDF, JPEG yookaan PNG · hanga 10 MB)',
    ti: 'ሰነድ ምምሕዳር ወይ ደንቢ (PDF፣ JPEG ወይ PNG · ክሳብ 10 MB)',
    so: 'Dukumentiga maamulka ama xeer-hoosaadka (PDF, JPEG ama PNG · ugu badnaan 10 MB)',
    ar: 'وثيقة الحوكمة أو اللوائح الداخلية (PDF أو JPEG أو PNG · بحد أقصى 10 ميغابايت)',
    sw: 'Hati ya utawala au katiba (PDF, JPEG au PNG · hadi MB 10)',
  },
  'Consent to application review': {
    am: 'ለማመልከቻ ግምገማ ፈቃድ', om: 'Gamaaggama iyyannoo irratti walii galuu', ti: 'ፍቓድ ግምገማ መመልከቲ', so: 'Oggolaanshaha dib-u-eegista codsiga', ar: 'الموافقة على مراجعة الطلب', sw: 'Idhini ya ukaguzi wa ombi',
  },
  'I authorize AfroLife Master Edir to use these organization and contact details to review this registration application. Approval does not replace the Edir’s own legal or governance obligations.': {
    am: 'AfroLife Master Edir ይህን የድርጅትና የመገናኛ መረጃ የምዝገባ ማመልከቻውን ለመገምገም እንዲጠቀም ፈቅጃለሁ። ፈቃድ የእድሩን ሕጋዊና የአስተዳደር ግዴታዎች አይተካም።',
    om: 'AfroLife Master Edir odeeffannoo dhaabbataa fi qunnamtii kana iyyannoo galmee kana gamaaggamuuf akka fayyadamu nan hayyama. Ragga’iinsi dirqama seeraa fi bulchiinsa Edir bakka hin bu’u.',
    ti: 'AfroLife Master Edir ነዚ ሓበሬታ ትካልን ርክብን ንምግምጋም መመልከቲ ክጥቀመሉ እፈቅድ። ምፍቃድ ግዴታታት ሕጊን ምምሕዳርን ናይ Edir ኣይትክእን።',
    so: 'Waxaan oggolaanayaa in AfroLife Master Edir u isticmaalo xogtan ururka iyo xiriirka si uu u eego codsigan. Oggolaanshuhu ma beddelayo waajibaadka sharci iyo maamul ee Edir-ka.',
    ar: 'أفوّض AfroLife Master Edir باستخدام بيانات المؤسسة والتواصل هذه لمراجعة طلب التسجيل. ولا تحل الموافقة محل الالتزامات القانونية أو الحوكمية الخاصة بإدير.',
    sw: 'Ninaidhinisha AfroLife Master Edir kutumia maelezo haya ya shirika na mawasiliano kukagua ombi hili. Idhini haibadilishi wajibu wa kisheria au utawala wa Edir yenyewe.',
  },
  'Submit Edir registration application': {
    am: 'የእድር ምዝገባ ማመልከቻ ያስገቡ', om: 'Iyyannoo galmee Edir ergaa', ti: 'መመልከቲ ምዝገባ Edir ኣቕርቡ', so: 'Gudbi codsiga diiwaangelinta Edir', ar: 'إرسال طلب تسجيل إدير', sw: 'Wasilisha ombi la usajili wa Edir',
  },
  'Change server': {
    am: 'አገልጋይ ቀይር', om: 'Sarvarii jijjiiri', ti: 'ሰርቨር ቀይር', so: 'Beddel server-ka', ar: 'تغيير الخادم', sw: 'Badilisha seva',
  },
  'Cancel server change': {
    am: 'የአገልጋይ ለውጥ ይተዉ', om: 'Jijjiirama sarvarii dhiisaa', ti: 'ለውጢ ሰርቨር ሰርዙ', so: 'Jooji beddelka server-ka', ar: 'إلغاء تغيير الخادم', sw: 'Ghairi mabadiliko ya seva',
  },
  'Connection settings': {
    am: 'የግንኙነት ቅንብሮች', om: 'Qindaa’ina walqunnamtii', ti: 'ቅጥዕታት ርክብ', so: 'Dejinta xiriirka', ar: 'إعدادات الاتصال', sw: 'Mipangilio ya muunganisho',
  },
  'Change the configured AfroLife server for this device. This affects only this app installation.': {
    am: 'ለዚህ መሣሪያ የተዋቀረውን የAfroLife አገልጋይ ይቀይሩ። ይህ ለዚህ መተግበሪያ ጭነት ብቻ ይሠራል።',
    om: 'Sarvarii AfroLife meeshaa kanaaf qindaa’e jijjiiraa. Jijjiiramni kun appii kana qofa irratti hojjeta.',
    ti: 'ንዚ መሳርሒ ዝተዳለወ ሰርቨር AfroLife ቀይሩ። እዚ ነዚ ጥራይ ዝተጻዕነ መተግበሪ ይጸልዎ።',
    so: 'Beddel server-ka AfroLife ee qalabkan loo dejiyey. Tani waxay saamaynaysaa rakibaaddan oo keliya.',
    ar: 'غيّر خادم AfroLife المُعدّ لهذا الجهاز. يؤثر ذلك على تثبيت هذا التطبيق فقط.',
    sw: 'Badilisha seva ya AfroLife iliyowekwa kwa kifaa hiki. Hili linaathiri usakinishaji huu wa programu pekee.',
  },
  'Workforce Management dashboard': {
    am: 'የሠራተኛ አስተዳደር ዳሽቦርድ', om: 'Daashboordii Bulchiinsa Hojjettootaa', ti: 'ዳሽቦርድ ምምሕዳር ሰራሕተኛ', so: 'Dashboard-ka Maamulka Shaqaalaha', ar: 'لوحة إدارة القوى العاملة', sw: 'Dashibodi ya Usimamizi wa Wafanyakazi',
  },
  'Staffing dashboard': {
    am: 'የሠራተኛ ማሰማራት ዳሽቦርድ', om: 'Daashboordii Ramaddii Hojjettootaa', ti: 'ዳሽቦርድ ምድባ ሰራሕተኛ', so: 'Dashboard-ka Shaqaale-qorista', ar: 'لوحة التوظيف', sw: 'Dashibodi ya Upangaji Wafanyakazi',
  },
  'Property sale and rental listings': {
    am: 'የሽያጭና ኪራይ ንብረቶች', om: 'Tarree qabeenya gurgurtaa fi kireeffannaa', ti: 'ዝርዝራት ንብረት ሽያጥን ኪራይን', so: 'Liisaska guryaha iibka iyo kirada', ar: 'قوائم العقارات للبيع والإيجار', sw: 'Orodha za mali za kuuza na kukodisha',
  },
  'Post and discover products, services, equipment and property with private photo and video uploads.': {
    am: 'ምስጢራዊ የፎቶና ቪዲዮ ሰቀላ በመጠቀም ምርቶችን፣ አገልግሎቶችን፣ መሣሪያዎችንና ንብረቶችን ያቅርቡ እና ያግኙ።', om: 'Suuraa fi viidiyoo dhuunfaa olkaa’uun oomisha, tajaajila, meeshaalee fi qabeenya maxxansaa fi barbaadaa.', ti: 'ምርታት፣ ኣገልግሎታት፣ መሳርሒታትን ንብረትን ብምስጢራዊ ምጽዓን ስእሊን ቪድዮን ኣቕርቡን ድለዩን።', so: 'Soo bandhig oo hel badeecooyin, adeegyo, qalab iyo hanti adigoo si gaar ah u gelinaya sawirro iyo muuqaallo.', ar: 'أضف واكتشف المنتجات والخدمات والمعدات والعقارات مع تحميل خاص للصور ومقاطع الفيديو.', sw: 'Chapisha na ugundue bidhaa, huduma, vifaa na mali kwa kupakia picha na video kwa faragha.',
  },
  'Create a listing': {
    am: 'ዝርዝር ይፍጠሩ', om: 'Tarree uumaa', ti: 'ዝርዝር ፍጠሩ', so: 'Samee liis', ar: 'إنشاء إعلان', sw: 'Unda tangazo',
  },
  'Listing domain': {
    am: 'የዝርዝር ምድብ', om: 'Gosa tarree', ti: 'ዓይነት ዝርዝር', so: 'Qaybta liiska', ar: 'فئة الإعلان', sw: 'Aina ya tangazo',
  },
  'Choose an active seller': {
    am: 'ንቁ ሻጭ ይምረጡ', om: 'Gurguraa hojii irra jiru filadhaa', ti: 'ንጡፍ ሸያጢ ምረጹ', so: 'Dooro iibiye firfircoon', ar: 'اختر بائعًا نشطًا', sw: 'Chagua muuzaji anayefanya kazi',
  },
  'Photos and videos (add at least one photo to post)': {
    am: 'ፎቶዎችና ቪዲዮዎች (ለማቅረብ ቢያንስ አንድ ፎቶ ያክሉ)', om: 'Suuraa fi viidiyoo (maxxansuuf yoo xiqqaate suuraa tokko dabalaa)', ti: 'ስእልታትን ቪድዮታትን (ንምልጣፍ እንተወሓደ ሓደ ስእሊ ወስኹ)', so: 'Sawirro iyo muuqaallo (ku dar ugu yaraan hal sawir si aad u daabacdo)', ar: 'الصور ومقاطع الفيديو (أضف صورة واحدة على الأقل للنشر)', sw: 'Picha na video (ongeza angalau picha moja ili kuchapisha)',
  },
  'No listings are available yet.': {
    am: 'እስካሁን ዝርዝር አልተገኘም።', om: 'Hanga ammaatti tarreen hin jiru.', ti: 'ክሳብ ሕጂ ዝርዝር የለን።', so: 'Weli ma jiraan liisas la heli karo.', ar: 'لا توجد إعلانات متاحة حتى الآن.', sw: 'Bado hakuna matangazo yanayopatikana.',
  },
  'For rent / hire': {
    am: 'ለኪራይ', om: 'Kireeffannaaf', ti: 'ንኪራይ', so: 'Kiro ah', ar: 'للإيجار', sw: 'Ya kukodisha',
  },
  'For sale': {
    am: 'ለሽያጭ', om: 'Gurgurtaaf', ti: 'ንሽያጥ', so: 'Iib ah', ar: 'للبيع', sw: 'Inauzwa',
  },
  'For rent': {
    am: 'ለኪራይ', om: 'Kireeffannaaf', ti: 'ንኪራይ', so: 'Kiro ah', ar: 'للإيجار', sw: 'Ya kukodisha',
  },
  'Sale or rent': {
    am: 'ሽያጭ ወይም ኪራይ', om: 'Gurgurtaa ykn kireeffannaa', ti: 'ሽያጥ ወይ ኪራይ', so: 'Iib ama kiro', ar: 'للبيع أو الإيجار', sw: 'Kuuza au kukodisha',
  },
  'Listing transaction': {
    am: 'የዝርዝር ግብይት', om: 'Daldala tarree', ti: 'ግብይት ዝርዝር', so: 'Macaamilka liiska', ar: 'نوع المعاملة للإعلان', sw: 'Muamala wa tangazo',
  },
  'Rental period': {
    am: 'የኪራይ ጊዜ', om: 'Yeroo kireeffannaa', ti: 'እዋን ኪራይ', so: 'Muddada kirada', ar: 'مدة الإيجار', sw: 'Kipindi cha upangishaji',
  },
  'Sale price (ETB)': {
    am: 'የሽያጭ ዋጋ (ብር)', om: 'Gatii gurgurtaa (ETB)', ti: 'ዋጋ ሽያጥ (ETB)', so: 'Qiimaha iibka (ETB)', ar: 'سعر البيع (ETB)', sw: 'Bei ya kuuza (ETB)',
  },
  'Price (ETB)': {
    am: 'ዋጋ (ብር)', om: 'Gatii (ETB)', ti: 'ዋጋ (ETB)', so: 'Qiimaha (ETB)', ar: 'السعر (ETB)', sw: 'Bei (ETB)',
  },
  'Daily': {
    am: 'በየቀኑ', om: 'Guyyaa guyyaan', ti: 'መዓልታዊ', so: 'Maalinle', ar: 'يومي', sw: 'Kila siku',
  },
  'Weekly': {
    am: 'በየሳምንቱ', om: 'Torban torbaniin', ti: 'ሰሙናዊ', so: 'Toddobaadle', ar: 'أسبوعي', sw: 'Kila wiki',
  },
  'Monthly': {
    am: 'በየወሩ', om: 'Ji’a ji’aan', ti: 'ወርሓዊ', so: 'Bille ah', ar: 'شهري', sw: 'Kila mwezi',
  },
  'Yearly': {
    am: 'በየዓመቱ', om: 'Wagga waggaan', ti: 'ዓመታዊ', so: 'Sannadle', ar: 'سنوي', sw: 'Kila mwaka',
  },
  'Post listing': {
    am: 'ዝርዝሩን አቅርብ', om: 'Tarree maxxansi', ti: 'ዝርዝር ኣቕርብ', so: 'Daabac liiska', ar: 'نشر الإعلان', sw: 'Chapisha tangazo',
  },
  'Published listings available': {
    am: 'የታተሙ ዝርዝሮች ይገኛሉ', om: 'Tarreewwan maxxanfaman ni jiru', ti: 'ዝተሓትሙ ዝርዝራት ይርከቡ', so: 'Liisaska la daabacay ee la heli karo', ar: 'الإعلانات المنشورة المتاحة', sw: 'Matangazo yaliyochapishwa yanapatikana',
  },
  'Browse available properties, prices, rental terms, and listing media.': {
    am: 'ያሉ ንብረቶችን፣ ዋጋዎችን፣ የኪራይ ውሎችንና ሚዲያዎችን ይመልከቱ።', om: 'Qabeenya jiru, gatii, haalawwan kireeffannaa fi miidiyaa tarree ilaalaa.', ti: 'ዘለዉ ንብረታት፣ ዋጋታት፣ ውዕላት ኪራይን ሚድያን ርአዩ።', so: 'Eeg hantida la heli karo, qiimayaasha, shuruudaha kirada iyo warbaahinta.', ar: 'تصفح العقارات المتاحة والأسعار وشروط الإيجار ووسائط الإعلان.', sw: 'Vinjari mali zilizopo, bei, masharti ya upangishaji na media za matangazo.',
  },
  'No available property listings are currently published.': {
    am: 'በአሁኑ ጊዜ የታተመ የንብረት ዝርዝር የለም።', om: 'Amma tarreen qabeenyaa maxxanfame hin jiru.', ti: 'ኣብዚ ግዜ ዝተሓትመ ዝርዝር ንብረት የለን።', so: 'Hadda ma jiraan liisas hantiyeed oo la daabacay.', ar: 'لا توجد حاليًا قوائم عقارية منشورة.', sw: 'Kwa sasa hakuna matangazo ya mali yaliyochapishwa.',
  },
  'For sale · ETB {{amount}}': {
    am: 'ለሽያጭ · ብር {{amount}}', om: 'Gurgurtaaf · ETB {{amount}}', ti: 'ንሽያጥ · ETB {{amount}}', so: 'Iib ah · ETB {{amount}}', ar: 'للبيع · {{amount}} ETB', sw: 'Inauzwa · ETB {{amount}}',
  },
  'For rent · Price on request': {
    am: 'ለኪራይ · ዋጋውን ይጠይቁ', om: 'Kireeffannaaf · Gatii gaafadhaa', ti: 'ንኪራይ · ዋጋ ሕተቱ', so: 'Kiro ah · Weydii qiimaha', ar: 'للإيجار · السعر عند الطلب', sw: 'Ya kukodisha · Uliza bei',
  },
  'For rent from ETB {{amount}} / {{period}}': {
    am: 'ከብር {{amount}} / {{period}} ለኪራይ', om: 'Kireeffannaa ETB {{amount}} / {{period}} irraa', ti: 'ካብ ETB {{amount}} / {{period}} ንኪራይ', so: 'Kiro laga bilaabo ETB {{amount}} / {{period}}', ar: 'للإيجار ابتداءً من {{amount}} ETB / {{period}}', sw: 'Kodi kuanzia ETB {{amount}} / {{period}}',
  },
  'Property Management dashboard': {
    am: 'የንብረት አስተዳደር ዳሽቦርድ', om: 'Daashboordii Bulchiinsa Qabeenyaa', ti: 'ዳሽቦርድ ምምሕዳር ንብረት', so: 'Dashboard-ka Maamulka Hantida', ar: 'لوحة إدارة العقارات', sw: 'Dashibodi ya Usimamizi wa Mali',
  },
  'A summary of worker records available to your account. Counts use the currently loaded worker data only.': {
    am: 'ለመለያዎ የሚገኙ የሠራተኛ መዝገቦች ማጠቃለያ። ቁጥሮቹ አሁን በተጫነው የሠራተኛ መረጃ ላይ ብቻ የተመሠረቱ ናቸው።',
    om: 'Cuunfaa galmee hojjettootaa herrega keessaniif argamuu. Lakkoofsi odeeffannoo hojjetaa amma fe’ame qofa fayyadama.',
    ti: 'ጽማቕ ናይ ንሕሳብኩም ዝርከቡ መዝገባት ሰራሕተኛ። ቁጽርታት ኣብ እዋኑ ዝተጻዕነ ሓበሬታ ጥራይ ይጥቀሙ።',
    so: 'Soo koobid diiwaannada shaqaalaha ee akoonkaaga loo heli karo. Tiradu waxay ku salaysan tahay xogta shaqaalaha ee hadda la raray oo keliya.',
    ar: 'ملخص سجلات العاملين المتاحة لحسابك. تستند الأعداد إلى بيانات العاملين المحمّلة حاليًا فقط.',
    sw: 'Muhtasari wa rekodi za wafanyakazi zinazopatikana kwenye akaunti yako. Hesabu hutumia data ya wafanyakazi iliyopakiwa sasa pekee.',
  },
  'A summary of staffing requests available to your account. Counts use the currently loaded request data only.': {
    am: 'ለመለያዎ የሚገኙ የሠራተኛ ጥያቄዎች ማጠቃለያ። ቁጥሮቹ አሁን በተጫነው የጥያቄ መረጃ ላይ ብቻ የተመሠረቱ ናቸው።',
    om: 'Cuunfaa gaaffii ramaddii hojii herrega keessaniif argamuu. Lakkoofsi gaaffii amma fe’ame qofa fayyadama.',
    ti: 'ጽማቕ ሕቶታት ስራሕ ንሕሳብኩም ዝርከቡ። ቁጽርታት ኣብ እዋኑ ዝተጻዕነ ሓበሬታ ሕቶ ጥራይ ይጥቀሙ።',
    so: 'Soo koobid codsiyada shaqaalaha ee akoonkaaga loo heli karo. Tiradu waxay ku salaysan tahay xogta codsiyada hadda la raray oo keliya.',
    ar: 'ملخص طلبات التوظيف المتاحة لحسابك. تستند الأعداد إلى بيانات الطلبات المحمّلة حاليًا فقط.',
    sw: 'Muhtasari wa maombi ya wafanyakazi yanayopatikana kwenye akaunti yako. Hesabu hutumia data ya maombi iliyopakiwa sasa pekee.',
  },
  'A summary of property listings available to your account. Counts use the currently loaded listing data only.': {
    am: 'ለመለያዎ የሚገኙ የንብረት ዝርዝሮች ማጠቃለያ። ቁጥሮቹ አሁን በተጫነው የዝርዝር መረጃ ላይ ብቻ የተመሠረቱ ናቸው።',
    om: 'Cuunfaa tarree qabeenyaa herrega keessaniif argamuu. Lakkoofsi tarree amma fe’ame qofa fayyadama.',
    ti: 'ጽማቕ ዝርዝራት ንብረት ንሕሳብኩም ዝርከቡ። ቁጽርታት ኣብ እዋኑ ዝተጻዕነ ዝርዝር ጥራይ ይጥቀሙ።',
    so: 'Soo koobid liisaska hantida ee akoonkaaga loo heli karo. Tiradu waxay ku salaysan tahay xogta liisaska hadda la raray oo keliya.',
    ar: 'ملخص قوائم العقارات المتاحة لحسابك. تستند الأعداد إلى بيانات القوائم المحمّلة حاليًا فقط.',
    sw: 'Muhtasari wa matangazo ya mali yanayopatikana kwenye akaunti yako. Hesabu hutumia data ya matangazo iliyopakiwa sasa pekee.',
  },
  'Dashboard information could not be loaded. Select Refresh to try again.': {
    am: 'የዳሽቦርድ መረጃውን መጫን አልተቻለም። እንደገና ለመሞከር አድስን ይምረጡ።',
    om: 'Odeeffannoo daashboordii fe’uun hin danda’amne. Irra deebi’uuf Haaromsi filadhaa.',
    ti: 'ሓበሬታ ዳሽቦርድ ምጽዓን ኣይተኻእለን። እንደገና ንምፍታን ኣሐድስ ምረጹ።',
    so: 'Lama rarik karo xogta dashboard-ka. Dooro Cusboonaysii si aad mar kale isugu daydo.',
    ar: 'تعذر تحميل معلومات لوحة المعلومات. اختر تحديث للمحاولة مجددًا.',
    sw: 'Imeshindikana kupakia taarifa za dashibodi. Chagua Onyesha upya ili ujaribu tena.',
  },
  'No worker records are currently available for this dashboard.': {
    am: 'ለዚህ ዳሽቦርድ አሁን የሠራተኛ መዝገብ የለም።', om: 'Daashboordii kanaaf galmeen hojjetaa amma hin jiru.', ti: 'ንዚ ዳሽቦርድ ኣብዚ ግዜ መዝገብ ሰራሕተኛ የለን።', so: 'Hadda ma jiraan diiwaanno shaqaale oo dashboard-kan loo heli karo.', ar: 'لا توجد حاليًا سجلات عاملين متاحة لهذه اللوحة.', sw: 'Kwa sasa hakuna rekodi za wafanyakazi zinazopatikana kwenye dashibodi hii.',
  },
  'No staffing requests are currently available for this dashboard.': {
    am: 'ለዚህ ዳሽቦርድ አሁን የሠራተኛ ጥያቄ የለም።', om: 'Daashboordii kanaaf gaaffiin hojii amma hin jiru.', ti: 'ንዚ ዳሽቦርድ ኣብዚ ግዜ ሕቶ ስራሕ የለን።', so: 'Hadda ma jiraan codsiyo shaqaale oo dashboard-kan loo heli karo.', ar: 'لا توجد حاليًا طلبات توظيف متاحة لهذه اللوحة.', sw: 'Kwa sasa hakuna maombi ya wafanyakazi yanayopatikana kwenye dashibodi hii.',
  },
  'No property listings are currently available for this dashboard.': {
    am: 'ለዚህ ዳሽቦርድ አሁን የንብረት ዝርዝር የለም።', om: 'Daashboordii kanaaf tarreen qabeenyaa amma hin jiru.', ti: 'ንዚ ዳሽቦርድ ኣብዚ ግዜ ዝርዝር ንብረት የለን።', so: 'Hadda ma jiraan liisas hantiyeed oo dashboard-kan loo heli karo.', ar: 'لا توجد حاليًا قوائم عقارية متاحة لهذه اللوحة.', sw: 'Kwa sasa hakuna matangazo ya mali yanayopatikana kwenye dashibodi hii.',
  },
  'Registered workers': {
    am: 'የተመዘገቡ ሠራተኞች', om: 'Hojjettoota galmaa’an', ti: 'ዝተመዝገቡ ሰራሕተኛታት', so: 'Shaqaale diiwaangashan', ar: 'العاملون المسجلون', sw: 'Wafanyakazi waliosajiliwa',
  },
  'Service requests': {
    am: 'የአገልግሎት ጥያቄዎች', om: 'Gaaffii tajaajilaa', ti: 'ሕቶታት ኣገልግሎት', so: 'Codsiyada adeegga', ar: 'طلبات الخدمة', sw: 'Maombi ya huduma',
  },
  'Property listings': {
    am: 'የንብረት ዝርዝሮች', om: 'Tarree qabeenyaa', ti: 'ዝርዝራት ንብረት', so: 'Liisaska hantida', ar: 'قوائم العقارات', sw: 'Matangazo ya mali',
  },
  'Units in listed properties': {
    am: 'በተዘረዘሩ ንብረቶች ያሉ ክፍሎች', om: 'Kutaa qabeenya tarreeffame keessaa', ti: 'ኣብ ዝተዘርዘሩ ንብረታት ዘለዉ ክፍልታት', so: 'Qaybaha ku jira hantida la taxay', ar: 'الوحدات في العقارات المدرجة', sw: 'Vitengo katika mali zilizoorodheshwa',
  },
  'Worker verification status': {
    am: 'የሠራተኛ ማረጋገጫ ሁኔታ', om: 'Haala mirkaneessa hojjetaa', ti: 'ኩነታት ምርግጋጽ ሰራሕተኛ', so: 'Xaaladda xaqiijinta shaqaalaha', ar: 'حالة التحقق من العامل', sw: 'Hali ya uthibitishaji wa mfanyakazi',
  },
  'Request status': {
    am: 'የጥያቄ ሁኔታ', om: 'Haala gaaffii', ti: 'ኩነታት ሕቶ', so: 'Xaaladda codsiga', ar: 'حالة الطلب', sw: 'Hali ya ombi',
  },
  'Listing status': {
    am: 'የዝርዝር ሁኔታ', om: 'Haala tarree', ti: 'ኩነታት ዝርዝር', so: 'Xaaladda liiska', ar: 'حالة القائمة', sw: 'Hali ya tangazo',
  },
  'Status': {
    am: 'ሁኔታ', om: 'Haala', ti: 'ኩነታት', so: 'Xaalad', ar: 'الحالة', sw: 'Hali',
  },
  'Count': {
    am: 'ብዛት', om: 'Lakkoofsa', ti: 'ቁጽሪ', so: 'Tiro', ar: 'العدد', sw: 'Idadi',
  },
  'Distribution': {
    am: 'ስርጭት', om: 'Raabsa', ti: 'ምክፍፋል', so: 'Qaybin', ar: 'التوزيع', sw: 'Mgawanyo',
  },
  '{{title}} status counts': {
    am: 'የ{{title}} ሁኔታ ብዛቶች', om: 'Lakkoofsa haala {{title}}', ti: 'ቁጽርታት ኩነታት {{title}}', so: 'Tirada xaaladaha {{title}}', ar: 'أعداد حالات {{title}}', sw: 'Idadi za hali ya {{title}}',
  },
  '{{status}}: {{count}}': {
    am: '{{status}}፦ {{count}}', om: '{{status}}: {{count}}', ti: '{{status}}፦ {{count}}', so: '{{status}}: {{count}}', ar: '{{status}}: {{count}}', sw: '{{status}}: {{count}}',
  },
  'Choose the services your organization needs': {
    am: 'ድርጅትዎ የሚፈልጋቸውን አገልግሎቶች ይምረጡ', om: 'Tajaajiloota dhaabbanni keessan barbaadu filadhaa', ti: 'ትካልኩም ዘድልዮ ኣገልግሎታት ምረጹ', so: 'Dooro adeegyada ururkaagu u baahan yahay', ar: 'اختر الخدمات التي تحتاجها مؤسستك', sw: 'Chagua huduma ambazo shirika lako linahitaji',
  },
  'Service subscriptions': {
    am: 'የአገልግሎት ምዝገባዎች', om: 'Galmee tajaajilaa', ti: 'ምዝገባ ኣገልግሎት', so: 'Rukumashada adeegyada', ar: 'اشتراكات الخدمات', sw: 'Usajili wa huduma',
  },
  'Finance payment review': {
    am: 'የፋይናንስ ክፍያ ግምገማ', om: 'Gamaaggama kaffaltii faayinaansii', ti: 'ግምገማ ክፍሊት ፋይናንስ', so: 'Dib-u-eegista lacag-bixinta Maaliyadda', ar: 'مراجعة المدفوعات المالية', sw: 'Mapitio ya malipo ya Fedha',
  },
  'The Finance review queue could not be loaded. Refresh to try again.': {
    am: 'የፋይናንስ ግምገማ ዝርዝር መጫን አልተቻለም። እንደገና ያድሱ።', om: 'Tarreen gamaaggama faayinaansii fe’amuu hin dandeenye. Irra deebi’anii haaromsaa.', ti: 'ዝርዝር ግምገማ ፋይናንስ ምጽዓን ኣይተኻእለን። እንደገና ኣሐድሱ።', so: 'Lama soo rari karo safka dib-u-eegista Maaliyadda. Cusboonaysii si aad mar kale isugu daydo.', ar: 'تعذر تحميل قائمة مراجعة المدفوعات. حدّث الصفحة للمحاولة مجددًا.', sw: 'Imeshindikana kupakia foleni ya mapitio ya malipo. Onyesha upya ujaribu tena.',
  },
  'Loading payment review requests…': {
    am: 'የክፍያ ግምገማ ጥያቄዎችን በመጫን ላይ…', om: 'Gaaffiiwwan gamaaggama kaffaltii fe’aa jira…', ti: 'ሕቶታት ግምገማ ክፍሊት ይጽዕን ኣሎ…', so: 'Waxaa la rarayaa codsiyada dib-u-eegista lacag-bixinta…', ar: 'جارٍ تحميل طلبات مراجعة المدفوعات…', sw: 'Inapakia maombi ya mapitio ya malipo…',
  },
  '{{count}} subscription payment(s) require review.': {
    am: '{{count}} የምዝገባ ክፍያ(ዎች) ግምገማ ይፈልጋሉ።', om: 'Kaffaltiin galmee {{count}} gamaaggama barbaada.', ti: '{{count}} ክፍሊት ምዝገባ ግምገማ የድሊ።', so: '{{count}} lacag-bixin rukumasho ayaa u baahan dib-u-eegis.', ar: 'تحتاج {{count}} مدفوعات اشتراك إلى المراجعة.', sw: 'Malipo {{count}} ya usajili yanahitaji mapitio.',
  },
  'No subscription payments are awaiting review.': {
    am: 'ግምገማ የሚጠብቅ የምዝገባ ክፍያ የለም።', om: 'Kaffaltiin galmee gamaaggama eeggatu hin jiru.', ti: 'ግምገማ ዝጽበ ክፍሊት ምዝገባ የለን።', so: 'Ma jiraan lacag-bixinno rukumasho oo sugaya dib-u-eegis.', ar: 'لا توجد مدفوعات اشتراك بانتظار المراجعة.', sw: 'Hakuna malipo ya usajili yanayosubiri mapitio.',
  },
  'Refresh payment review': {
    am: 'የክፍያ ግምገማን አድስ', om: 'Gamaaggama kaffaltii haaromsi', ti: 'ግምገማ ክፍሊት ኣሐድስ', so: 'Cusboonaysii dib-u-eegista lacag-bixinta', ar: 'تحديث مراجعة المدفوعات', sw: 'Onyesha upya mapitio ya malipo',
  },
  'Confirm payment': {
    am: 'ክፍያን አረጋግጥ', om: 'Kaffaltii mirkaneessi', ti: 'ክፍሊት ኣረጋግጽ', so: 'Xaqiiji lacag-bixinta', ar: 'تأكيد الدفع', sw: 'Thibitisha malipo',
  },
  'Reject payment': {
    am: 'ክፍያን ውድቅ አድርግ', om: 'Kaffaltii didi', ti: 'ክፍሊት ነጽግ', so: 'Diid lacag-bixinta', ar: 'رفض الدفع', sw: 'Kataa malipo',
  },
  'Enter the payment confirmation reason (minimum 10 characters).': {
    am: 'የክፍያ ማረጋገጫ ምክንያትን ያስገቡ (ቢያንስ 10 ቁምፊዎች)።', om: 'Sababa mirkaneessa kaffaltii galchaa (qubee yoo xiqqaate 10).', ti: 'ምኽንያት ምርግጋጽ ክፍሊት ኣእትዉ (ብውሑዱ 10 ፊደላት).', so: 'Geli sababta xaqiijinta lacag-bixinta (ugu yaraan 10 xaraf).', ar: 'أدخل سبب تأكيد الدفع (10 أحرف على الأقل).', sw: 'Weka sababu ya kuthibitisha malipo (angalau herufi 10).',
  },
  'Enter the rejection reason (minimum 10 characters).': {
    am: 'የውድቅ ምክንያትን ያስገቡ (ቢያንስ 10 ቁምፊዎች)።', om: 'Sababa diduu galchaa (qubee yoo xiqqaate 10).', ti: 'ምኽንያት ምንጻግ ኣእትዉ (ብውሑዱ 10 ፊደላት).', so: 'Geli sababta diidmada (ugu yaraan 10 xaraf).', ar: 'أدخل سبب الرفض (10 أحرف على الأقل).', sw: 'Weka sababu ya kukataa (angalau herufi 10).',
  },
  'Payment confirmed. Service activation will begin after Accounting records the transaction.': {
    am: 'ክፍያው ተረጋግጧል። ሂሳብ ክፍያውን ከመዘገበ በኋላ አገልግሎቱ ይነቃል።', om: 'Kaffaltiin mirkanaa’eera. Herregni erga galmeessee booda tajaajilli ni banama.', ti: 'ክፍሊት ተረጋጊጹ። ሒሳብ ነቲ ግብይት ምስ መዝገቦ ኣገልግሎት ክንቀሳቐስ እዩ።', so: 'Lacag-bixinta waa la xaqiijiyey. Adeeggu wuxuu hawlgelayaa ka dib marka Xisaabtu diiwaangeliso macaamilka.', ar: 'تم تأكيد الدفع. سيبدأ تفعيل الخدمة بعد تسجيل المعاملة في المحاسبة.', sw: 'Malipo yamethibitishwa. Huduma itaanza baada ya Uhasibu kurekodi muamala.',
  },
  'Payment reference': {
    am: 'የክፍያ ማጣቀሻ', om: 'Wabii kaffaltii', ti: 'መወከሲ ክፍሊት', so: 'Tixraaca lacag-bixinta', ar: 'مرجع الدفع', sw: 'Rejea ya malipo',
  },
  'Submit payment reference': {
    am: 'የክፍያ ማጣቀሻ አስገባ', om: 'Wabii kaffaltii galchi', ti: 'መወከሲ ክፍሊት ኣቕርብ', so: 'Gudbi tixraaca lacag-bixinta', ar: 'إرسال مرجع الدفع', sw: 'Wasilisha rejea ya malipo',
  },
  'Payment reference: {{reference}}': {
    am: 'የክፍያ ማጣቀሻ፦ {{reference}}', om: 'Wabii kaffaltii: {{reference}}', ti: 'መወከሲ ክፍሊት፦ {{reference}}', so: 'Tixraaca lacag-bixinta: {{reference}}', ar: 'مرجع الدفع: {{reference}}', sw: 'Rejea ya malipo: {{reference}}',
  },
  'Payment reference submitted for independent Finance review.': {
    am: 'የክፍያ ማጣቀሻው ለገለልተኛ የፋይናንስ ግምገማ ተልኳል።', om: 'Wabiin kaffaltii gamaaggama faayinaansii walabaa irratti ergameera.', ti: 'መወከሲ ክፍሊት ንናጻ ግምገማ ፋይናንስ ተላኢኹ።', so: 'Tixraaca lacag-bixinta waxaa loo diray dib-u-eegis Maaliyadeed oo madax-bannaan.', ar: 'أُرسل مرجع الدفع لمراجعة مالية مستقلة.', sw: 'Rejea ya malipo imetumwa kwa mapitio huru ya Fedha.',
  },
  'The subscription request is missing its identifier.': {
    am: 'የምዝገባ ጥያቄው መለያ ቁጥር የለውም።', om: 'Gaaffiin galmee kun eenyummaa hin qabu.', ti: 'እቲ ሕቶ ምዝገባ መለለዪ የብሉን።', so: 'Codsiga rukumashadu ma laha aqoonsi.', ar: 'طلب الاشتراك يفتقد المعرّف.', sw: 'Ombi la usajili halina kitambulisho chake.',
  },
  'Subscription payment decision recorded.': {
    am: 'የምዝገባ ክፍያ ውሳኔ ተመዝግቧል።', om: 'Murtiin kaffaltii galmee galmaa’eera.', ti: 'ውሳነ ክፍሊት ምዝገባ ተመዝጊቡ።', so: 'Go’aanka lacag-bixinta rukumashada waa la diiwaangeliyey.', ar: 'تم تسجيل قرار دفع الاشتراك.', sw: 'Uamuzi wa malipo ya usajili umerekodiwa.',
  },
  'ETB 1,000 per month for each selected service': {
    am: 'ለእያንዳንዱ የተመረጠ አገልግሎት በወር ETB 1,000', om: 'Tajaajila filatame tokkoon tokkoon ji’atti ETB 1,000', ti: 'ንነፍሲ ወከፍ ዝተመርጸ ኣገልግሎት ኣብ ወርሒ ETB 1,000', so: 'ETB 1,000 bishii adeeg kasta oo la doorto', ar: '١٬٠٠٠ بر إثيوبي شهريًا لكل خدمة مختارة', sw: 'ETB 1,000 kwa mwezi kwa kila huduma iliyochaguliwa',
  },
  'Payment is manual. Finance confirms receipt before activation. A subscription request does not charge you or activate a service automatically.': {
    am: 'ክፍያ በእጅ ይፈጸማል። ፋይናንስ ክፍያውን ከማረጋገጡ በፊት አገልግሎት አይነቃም። የምዝገባ ጥያቄ ክፍያ አያስከፍልም ወይም አገልግሎትን በራስ-ሰር አያነቃም።',
    om: 'Kaffaltiin harkaan raawwatama. Faayinaansiin kaffaltii mirkaneessuu dura tajaajilli hin banamu. Gaaffiin tajaajilaa kaffaltii hin fudhatu yookaan tajaajila ofumaan hin banu.',
    ti: 'ክፍሊት ብኢድ ይፍጸም። ፋይናንስ ክፍሊት ቅድሚ ምርግጋጹ ኣገልግሎት ኣይንቀሳቐስን። ሕቶ ክፍሊት ኣይእክብን ኣገልግሎት ብርእሱ ኣይንቀሳቐስን።',
    so: 'Lacag-bixintu waa gacanta. Maaliyaddu waxay xaqiijinaysaa helitaanka ka hor hawlgelinta. Codsiga isdiiwaangelintu lacag kuguma dallacayo mana hawlgelinayo adeeg si toos ah.',
    ar: 'الدفع يدوي. تؤكد الشؤون المالية استلام المبلغ قبل التفعيل. طلب الاشتراك لا يفرض رسومًا ولا يفعّل الخدمة تلقائيًا.',
    sw: 'Malipo hufanywa kwa mikono. Fedha huthibitisha kupokea malipo kabla ya kuwezesha. Ombi la usajili halikutozi wala kuwezesha huduma moja kwa moja.',
  },
  'ETB 1,000 per month for this service': {
    am: 'ለዚህ አገልግሎት በወር ETB 1,000', om: 'Tajaajila kanaaf ji’atti ETB 1,000', ti: 'ንዚ ኣገልግሎት ኣብ ወርሒ ETB 1,000', so: 'ETB 1,000 bishii adeeggan', ar: '١٬٠٠٠ بر إثيوبي شهريًا لهذه الخدمة', sw: 'ETB 1,000 kwa mwezi kwa huduma hii',
  },
  'Estimated monthly total: ETB {{amount}}': {
    am: 'ግምታዊ ወርሃዊ ድምር፦ ETB {{amount}}', om: 'Waliigala ji’aa tilmaamame: ETB {{amount}}', ti: 'ግምታዊ ጠቕላላ ወርሒ፦ ETB {{amount}}', so: 'Wadarta bisha la qiyaasay: ETB {{amount}}', ar: 'الإجمالي الشهري التقديري: {{amount}} بر إثيوبي', sw: 'Jumla ya makadirio ya mwezi: ETB {{amount}}',
  },
  'Request selected services': {
    am: 'የተመረጡ አገልግሎቶችን ይጠይቁ', om: 'Tajaajiloota filataman gaafadhaa', ti: 'ዝተመርጹ ኣገልግሎታት ሕተቱ', so: 'Codso adeegyada la doortay', ar: 'اطلب الخدمات المحددة', sw: 'Omba huduma ulizochagua',
  },
  'Sign in to request selected services': {
    am: 'የተመረጡ አገልግሎቶችን ለመጠየቅ ይግቡ', om: 'Tajaajiloota filataman gaafachuuf seenaa', ti: 'ዝተመርጹ ኣገልግሎታት ንምሕታት እቶ', so: 'Gal si aad u codsato adeegyada la doortay', ar: 'سجّل الدخول لطلب الخدمات المحددة', sw: 'Ingia ili kuomba huduma ulizochagua',
  },
  'Select at least one service to request.': {
    am: 'ለመጠየቅ ቢያንስ አንድ አገልግሎት ይምረጡ።', om: 'Gaafachuuf yoo xiqqaate tajaajila tokko filadhaa.', ti: 'ንምሕታት እንተወሓደ ሓደ ኣገልግሎት ምረጹ።', so: 'Dooro ugu yaraan hal adeeg si aad u codsato.', ar: 'اختر خدمة واحدة على الأقل لطلبها.', sw: 'Chagua angalau huduma moja ya kuomba.',
  },
  'Available subscriptions could not be loaded. Try again when the connection is available.': {
    am: 'የሚገኙ ምዝገባዎችን መጫን አልተቻለም። ግንኙነቱ ሲኖር እንደገና ይሞክሩ።', om: 'Galmee tajaajilaa fe’uun hin danda’amne. Walqunnamtiin yeroo jiru irra deebi’anii yaalaa.', ti: 'ዝርከቡ ምዝገባታት ምጽዓን ኣይተኻእለን። ርክብ እንተሃልዩ እንደገና ፈትኑ።', so: 'Lama soo rari karo rukumashada la heli karo. Mar kale isku day marka xiriirku jiro.', ar: 'تعذر تحميل الاشتراكات المتاحة. حاول مجددًا عند توفر الاتصال.', sw: 'Imeshindikana kupakia usajili unaopatikana. Jaribu tena muunganisho ukiwa tayari.',
  },
  'Retry loading subscriptions': {
    am: 'ምዝገባዎችን እንደገና ጫን', om: 'Galmee irra deebi’anii fe’i', ti: 'ምዝገባታት እንደገና ጽዓን', so: 'Dib u rar rukumashada', ar: 'أعد تحميل الاشتراكات', sw: 'Pakia tena usajili',
  },
  'There are no public subscriptions available right now.': {
    am: 'በአሁኑ ጊዜ ለሕዝብ የሚቀርብ ምዝገባ የለም።', om: 'Yeroo ammaa galmeen uummataaf dhiyaatu hin jiru.', ti: 'ኣብዚ ግዜ ንህዝቢ ዝቐርብ ምዝገባ የለን።', so: 'Hadda ma jiraan rukumasho dadweyne oo la heli karo.', ar: 'لا توجد اشتراكات عامة متاحة حاليًا.', sw: 'Kwa sasa hakuna usajili wa umma unaopatikana.',
  },
  'Subscription request submitted. Payment is manual; Finance must confirm receipt before activation. No automatic charge was made.': {
    am: 'የምዝገባ ጥያቄው ተልኳል። ክፍያ በእጅ ይፈጸማል፤ ከማግበር በፊት ፋይናንስ መቀበሉን ማረጋገጥ አለበት። በራስ-ሰር ክፍያ አልተፈጸመም።',
    om: 'Gaaffiin galmee ergameera. Kaffaltiin harkaan; faayinaansiin hojii irra ooluu dura kaffaltii mirkaneessuu qaba. Kaffaltiin ofumaan hin raawwatamne.',
    ti: 'ሕቶ ምዝገባ ተላኢኹ። ክፍሊት ብኢድ እዩ፤ ፋይናንስ ቅድሚ ምንቃሕ ክቕበሎ ኣለዎ። ብርእሱ ክፍሊት ኣይተፈጸመን።',
    so: 'Codsiga rukumashada waa la diray. Lacag-bixintu waa gacanta; Maaliyaddu waa inay xaqiijisaa helitaanka ka hor hawlgelinta. Lacag si toos ah looma qaadin.',
    ar: 'تم إرسال طلب الاشتراك. الدفع يدوي؛ ويجب أن تؤكد الشؤون المالية الاستلام قبل التفعيل. لم يتم فرض أي رسوم تلقائية.',
    sw: 'Ombi la usajili limetumwa. Malipo ni ya mikono; Fedha lazima zithibitishe kupokea kabla ya kuwezesha. Hakuna malipo ya moja kwa moja yaliyofanywa.',
  },
  'Pending finance confirmation': {
    am: 'የፋይናንስ ማረጋገጫ በመጠባበቅ ላይ', om: 'Mirkaneessa faayinaansii eegaa jira', ti: 'ምርግጋጽ ፋይናንስ ይጽበ ኣሎ', so: 'Sugaya xaqiijinta maaliyadda', ar: 'بانتظار تأكيد الشؤون المالية', sw: 'Inasubiri uthibitisho wa Fedha',
  },
  'Your subscription requests could not be loaded. Select Refresh to try again.': {
    am: 'የምዝገባ ጥያቄዎችዎን መጫን አልተቻለም። እንደገና ለመሞከር አድስን ይምረጡ።', om: 'Gaaffiiwwan galmee keessanii fe’uun hin danda’amne. Irra deebi’uuf Haaromsi filadhaa.', ti: 'ሕቶታት ምዝገባኹም ምጽዓን ኣይተኻእለን። ንምፍታን ኣሐድስ ምረጹ።', so: 'Lama soo rari karo codsiyada rukumashadaada. Dooro Cusboonaysii si aad mar kale isugu daydo.', ar: 'تعذر تحميل طلبات اشتراكك. اختر تحديث للمحاولة مجددًا.', sw: 'Imeshindikana kupakia maombi yako ya usajili. Chagua Onyesha upya ili ujaribu tena.',
  },
  'Your subscription requests': {
    am: 'የእርስዎ የምዝገባ ጥያቄዎች', om: 'Gaaffiiwwan galmee keessan', ti: 'ሕቶታት ምዝገባኹም', so: 'Codsiyadaada rukumashada', ar: 'طلبات اشتراكك', sw: 'Maombi yako ya usajili',
  },
  'No subscription requests yet.': {
    am: 'እስካሁን የምዝገባ ጥያቄ የለም።', om: 'Ammaaf gaaffiin galmee hin jiru.', ti: 'ክሳብ ሕጂ ሕቶ ምዝገባ የለን።', so: 'Weli ma jiraan codsiyo rukumasho.', ar: 'لا توجد طلبات اشتراك بعد.', sw: 'Bado hakuna maombi ya usajili.',
  },
  'Selected services': {
    am: 'የተመረጡ አገልግሎቶች', om: 'Tajaajiloota filataman', ti: 'ዝተመርጹ ኣገልግሎታት', so: 'Adeegyada la doortay', ar: 'الخدمات المحددة', sw: 'Huduma zilizochaguliwa',
  },
  '{{services}} — {{status}}': {
    am: '{{services}} — {{status}}', om: '{{services}} — {{status}}', ti: '{{services}} — {{status}}', so: '{{services}} — {{status}}', ar: '{{services}} — {{status}}', sw: '{{services}} — {{status}}',
  },
  '{{name}} · ETB {{amount}} · reference {{reference}}': {
    am: '{{name}} · ETB {{amount}} · ማጣቀሻ {{reference}}', om: '{{name}} · ETB {{amount}} · wabii {{reference}}', ti: '{{name}} · ETB {{amount}} · መወከሲ {{reference}}', so: '{{name}} · ETB {{amount}} · tixraac {{reference}}', ar: '{{name}} · {{amount}} بر إثيوبي · المرجع {{reference}}', sw: '{{name}} · ETB {{amount}} · rejea {{reference}}',
  },
  'Loading available subscriptions…': {
    am: 'የሚገኙ ምዝገባዎችን በመጫን ላይ…', om: 'Galmeewwan jiran fe’aa jira…', ti: 'ምዝገባታት ይጽዕን ኣሎ…', so: 'Waxaa la rarayaa rukumashooyinka la heli karo…', ar: 'جارٍ تحميل الاشتراكات المتاحة…', sw: 'Inapakia usajili unaopatikana…',
  },
  'Select the services you need': {
    am: 'የሚፈልጓቸውን አገልግሎቶች ይምረጡ', om: 'Tajaajiloota isin barbaaddan filadhaa', ti: 'ዘድልዩኹም ኣገልግሎታት ምረጹ', so: 'Dooro adeegyada aad u baahan tahay', ar: 'اختر الخدمات التي تحتاجها', sw: 'Chagua huduma unazohitaji',
  },
  'Submit Edir registration application': {
    am: 'የእድር ምዝገባ ማመልከቻ ያስገቡ', om: 'Iyyannoo galmee Edir ergaa', ti: 'መመልከቲ ምዝገባ Edir ኣቕርቡ', so: 'Gudbi codsiga diiwaangelinta Edir', ar: 'إرسال طلب تسجيل إدير', sw: 'Wasilisha ombi la usajili wa Edir',
  },
  'Retry Edir document uploads': {
    am: 'የእድር ሰነዶችን እንደገና ይላኩ', om: 'Sanadoota Edir irra deebi’anii ergaa', ti: 'ሰነዳት Edir እንደገና ስደዱ', so: 'Dib u dir dukumentiyada Edir', ar: 'أعد محاولة رفع وثائق إدير', sw: 'Jaribu tena kupakia nyaraka za Edir',
  },
  'All required documents uploaded': {
    am: 'ሁሉም የሚፈለጉ ሰነዶች ተጭነዋል', om: 'Sanadoonni barbaachisan hundi fe’amaniiru', ti: 'ኩሎም ዝድለዩ ሰነዳት ተጸዒኖም', so: 'Dhammaan dukumentiyada loo baahan yahay waa la raray', ar: 'تم رفع جميع الوثائق المطلوبة', sw: 'Nyaraka zote zinazohitajika zimepakiwa',
  },
  'Application {{id}} is saved. {{uploaded}} of {{total}} required documents uploaded. Select the remaining document files and retry: {{documents}}.': {
    am: 'ማመልከቻ {{id}} ተቀምጧል። ከ{{total}} የሚፈለጉ ሰነዶች {{uploaded}} ተጭነዋል። የቀሩትን ይምረጡና እንደገና ይሞክሩ፦ {{documents}}።',
    om: 'Iyyannoon {{id}} olkaa’ameera. Sanadoota barbaachisan {{total}} keessaa {{uploaded}} fe’amaniiru. Sanada hafe filadhaa, irra deebi’a: {{documents}}.',
    ti: 'መመልከቲ {{id}} ተዓቂቡ። ካብ {{total}} ዝድለዩ ሰነዳት {{uploaded}} ተጸዒኖም። ዝተረፉ ሰነዳት ምረጹን እንደገና ፈትኑን፦ {{documents}}።',
    so: 'Codsiga {{id}} waa la kaydiyey. {{uploaded}} ka mid ah {{total}} dukumenti ayaa la raray. Dooro faylasha hadhay oo mar kale isku day: {{documents}}.',
    ar: 'تم حفظ الطلب {{id}}. رُفع {{uploaded}} من أصل {{total}} من الوثائق المطلوبة. اختر الملفات المتبقية وأعد المحاولة: {{documents}}.',
    sw: 'Ombi {{id}} limehifadhiwa. Nyaraka {{uploaded}} kati ya {{total}} zinazohitajika zimepakiwa. Chagua faili zilizobaki na ujaribu tena: {{documents}}.',
  },
  'Application {{id}} was saved; {{uploaded}} of {{total}} required documents uploaded. {{error}} Select the remaining file and retry. Your form details and unuploaded file selections are still here.': {
    am: 'ማመልከቻ {{id}} ተቀምጧል፤ ከ{{total}} የሚፈለጉ ሰነዶች {{uploaded}} ተጭነዋል። {{error}} የቀረውን ፋይል ይምረጡና እንደገና ይሞክሩ። የቅጹ ዝርዝሮችና ያልተላኩ ፋይሎች አሁንም እዚህ አሉ።',
    om: 'Iyyannoon {{id}} olkaa’ameera; sanadoota {{total}} keessaa {{uploaded}} fe’amaniiru. {{error}} Faayila hafe filadhaa irra deebi’aa. Odeeffannoon unka keessanii fi faayiloonni hin ergamne asuma jiru.',
    ti: 'መመልከቲ {{id}} ተዓቂቡ፤ ካብ {{total}} ዝድለዩ ሰነዳት {{uploaded}} ተጸዒኖም። {{error}} ዝተረፈ ፋይል ምረጹን እንደገና ፈትኑን። ዝርዝራት ቅጺኹምን ዘይተላእኩ ፋይላትን ኣብዚ ኣለዉ።',
    so: 'Codsiga {{id}} waa la kaydiyey; {{uploaded}} ka mid ah {{total}} dukumenti ayaa la raray. {{error}} Dooro faylka hadhay oo mar kale isku day. Faahfaahinta foomka iyo faylasha aan la dirin way kuu yaallaan.',
    ar: 'تم حفظ الطلب {{id}}؛ رُفع {{uploaded}} من أصل {{total}} من الوثائق المطلوبة. {{error}} اختر الملف المتبقي وأعد المحاولة. ما زالت تفاصيل النموذج والملفات غير المرفوعة محفوظة هنا.',
    sw: 'Ombi {{id}} limehifadhiwa; nyaraka {{uploaded}} kati ya {{total}} zimepakiwa. {{error}} Chagua faili iliyobaki na ujaribu tena. Maelezo ya fomu na faili ambazo hazijapakiwa bado zipo hapa.',
  },
  'Select the required {{document}} file.': {
    am: 'የሚፈለገውን {{document}} ፋይል ይምረጡ።', om: 'Faayila {{document}} barbaachisu filadhaa.', ti: 'ዝድለ ፋይል {{document}} ምረጹ።', so: 'Dooro faylka {{document}} ee loo baahan yahay.', ar: 'اختر ملف {{document}} المطلوب.', sw: 'Chagua faili ya {{document}} inayohitajika.',
  },
  'The application response did not include the secure upload details. Contact AfroLife support before submitting again.': {
    am: 'የማመልከቻው ምላሽ ደህንነቱ የተጠበቀ የመጫኛ መረጃ አልያዘም። እንደገና ከማስገባትዎ በፊት የAfroLife ድጋፍን ያነጋግሩ።',
    om: 'Deebiin iyyannoo odeeffannoo fe’iinsa nageenya qabu hin qabne. Irra deebi’anii erguu dura deeggarsa AfroLife qunnamaa.',
    ti: 'መልሲ መመልከቲ ውሑስ ሓበሬታ ምጽዓን ኣይሓዘን። እንደገና ቅድሚ ምቕራብ ደገፍ AfroLife ርኸቡ።',
    so: 'Jawaabta codsigu kuma jirin faahfaahinta rarista ammaan ah. La xiriir taageerada AfroLife ka hor intaadan mar kale gudbin.',
    ar: 'لم يتضمن رد الطلب تفاصيل الرفع الآمن. اتصل بدعم AfroLife قبل إعادة الإرسال.',
    sw: 'Jibu la ombi halikuwa na maelezo ya upakiaji salama. Wasiliana na usaidizi wa AfroLife kabla ya kutuma tena.',
  },
  'Replacement document uploaded securely for compliance review.': {
    am: 'የምትክ ሰነዱ ለተገዢነት ግምገማ በደህንነት ተጭኗል።', om: 'Sanadni bakka bu’aa gamaaggamaaf nageenyaan fe’ameera.', ti: 'ምትክ ሰነድ ንግምገማ ብውሑስነት ተጸዒኑ።', so: 'Dukumentiga beddelka ah si ammaan ah ayaa loogu raray dib-u-eegista.', ar: 'تم رفع الوثيقة البديلة بأمان للمراجعة.', sw: 'Hati mbadala imepakiwa kwa usalama kwa ukaguzi.',
  },
  'One trusted place to get work moving.': {
    am: 'ሥራን ለማስኬድ አንድ የታመነ ቦታ።', om: 'Bakka amanamaa hojii itti jalqabsiisan.', ti: 'ስራሕ ንምንቅስቓስ ሓደ ዝተኣመነ ቦታ።', so: 'Hal meel lagu kalsoon yahay oo shaqada dhaqaajisa.', ar: 'مكان موثوق واحد لدفع العمل قدمًا.', sw: 'Sehemu moja ya kuaminika ya kuendeleza kazi.',
  },
  'Coordinate leads, verified workers and service requests with clear ownership at every step.': {
    am: 'ደንበኞችን፣ የተረጋገጡ ሠራተኞችንና የአገልግሎት ጥያቄዎችን በግልጽ ኃላፊነት ያስተባብሩ።', om: 'Maamiltoota, hojjettoota mirkanaa’an fi gaaffii tajaajilaa itti gaafatamummaa ifa ta’een qindeessaa.', ti: 'መራሕቲ፣ ዝተረጋገጹ ሰራሕተኛታትን ሕቶታት ኣገልግሎትን ብግልጺ ሓላፍነት ኣወሃህዱ።', so: 'Isku dubbarid fursadaha, shaqaalaha la xaqiijiyey iyo codsiyada adeegga adigoo mas’uuliyad cad leh.', ar: 'نسّق الفرص والعاملين المتحقق منهم وطلبات الخدمة مع وضوح المسؤولية في كل خطوة.', sw: 'Ratibu fursa, wafanyakazi waliothibitishwa na maombi ya huduma kwa uwajibikaji ulio wazi.',
  },
  'Verified workforce': {
    am: 'የተረጋገጠ የሠራተኛ ኃይል', om: 'Hojjettoota mirkanaa’an', ti: 'ዝተረጋገጸ ሓይሊ ሰራሕተኛ', so: 'Shaqaale la xaqiijiyey', ar: 'قوى عاملة تم التحقق منها', sw: 'Wafanyakazi waliothibitishwa',
  },
  'Accountable agent network': {
    am: 'ተጠያቂነት ያለው የወኪሎች መረብ', om: 'Neetworkii bakka bu’oota itti gaafatamummaa qabu', ti: 'ተሓታትነት ዘለዎ መርበብ ወከልቲ', so: 'Shabakad wakiillo lala xisaabtami karo', ar: 'شبكة وكلاء خاضعة للمساءلة', sw: 'Mtandao wa mawakala wenye uwajibikaji',
  },
  'Central matching oversight': {
    am: 'ማዕከላዊ የማዛመድ ቁጥጥር', om: 'To’annoo walitti fiduu giddugaleessaa', ti: 'ማእከላዊ ቁጽጽር ምዝማድ', so: 'Kormeerka dhexe ee iswaafajinta', ar: 'إشراف مركزي على المطابقة', sw: 'Uangalizi mkuu wa ulinganishaji',
  },
  'SECURE WORKSPACE': {
    am: 'ደህንነቱ የተጠበቀ የሥራ ቦታ', om: 'Iddoo hojii nageenya qabu', ti: 'ውሑስ ቦታ ስራሕ', so: 'GOOB SHAQO OO AMMAAN AH', ar: 'مساحة عمل آمنة', sw: 'NAFASI SALAMA YA KAZI',
  },
  'Welcome back': {
    am: 'እንኳን ደህና መጡ', om: 'Baga nagaan deebiitan', ti: 'እንቋዕ ብደሓን ተመለስኩም', so: 'Ku soo dhawoow', ar: 'مرحبًا بعودتك', sw: 'Karibu tena',
  },
  'Sign in with your registered Ethiopian phone number.': {
    am: 'በተመዘገበው የኢትዮጵያ ስልክ ቁጥርዎ ይግቡ።', om: 'Lakkoofsa bilbilaa Itoophiyaa galmeessitan fayyadamuun seenaa.', ti: 'ብዝተመዝገበ ቁጽሪ ስልኪ ኢትዮጵያ እቶ።', so: 'Ku gal lambarka taleefanka Itoobiya ee aad ku diiwaangashan tahay.', ar: 'سجّل الدخول برقم هاتفك الإثيوبي المسجل.', sw: 'Ingia ukitumia nambari yako ya simu ya Ethiopia iliyosajiliwa.',
  },
  'Agent subscription plans': {
    am: 'የወኪል ምዝገባ ዕቅዶች', om: 'Karoorawwan galmee bakka bu’aa', ti: 'መደባት ምዝገባ ወኪል', so: 'Qorshayaasha rukumashada wakiilka', ar: 'خطط اشتراك الوكلاء', sw: 'Mipango ya usajili wa wakala',
  },
  'Apply to join AfroLife': {
    am: 'ወደ AfroLife ለመቀላቀል ያመልክቱ', om: 'AfroLife waliin makamuuf iyyadhaa', ti: 'ምስ AfroLife ንምጽንባር ኣመልክቱ', so: 'Codso inaad ku biirto AfroLife', ar: 'قدّم طلبًا للانضمام إلى AfroLife', sw: 'Omba kujiunga na AfroLife',
  },
  'Request community membership after KYC. Available membership products and terms are shown in the Edir workspace.': {
    am: 'ከKYC በኋላ የማህበረሰብ አባልነት ይጠይቁ። ያሉ የአባልነት ምርቶችና ውሎች በእድር የሥራ ቦታ ይታያሉ።', om: 'KYC booda miseensummaa hawaasaa gaafadhaa. Oomishaa fi ulaagaaleen Edir keessatti mul’atu.', ti: 'ድሕሪ KYC ኣባልነት ማሕበረሰብ ሕተቱ። ዘለዉ ፍርያትን ውዕላትን ኣብ ቦታ Edir ይርከቡ።', so: 'Codso xubinnimada bulshada kadib KYC. Adeegyada iyo shuruudaha xubinnimada waxaa lagu muujiyaa goobta Edir.', ar: 'اطلب عضوية المجتمع بعد KYC. تظهر منتجات العضوية وشروطها المتاحة في مساحة عمل إدير.', sw: 'Omba uanachama wa jamii baada ya KYC. Bidhaa na masharti ya uanachama yanaonyeshwa kwenye nafasi ya Edir.',
  },
  'ETHIOLIFE SUPER APP': {
    am: 'ETHIOLIFE ሱፐር አፕ', om: 'APPII SUPER ETHIOLIFE', ti: 'SUPER APP ETHIOLIFE', so: 'BARNAAMIJKA WEYN EE ETHIOLIFE', ar: 'تطبيق ETHIOLIFE الشامل', sw: 'SUPER APP YA ETHIOLIFE',
  },
  'Services for work, homes, business, and community.': {
    am: 'ለሥራ፣ ለቤት፣ ለንግድና ለማህበረሰብ አገልግሎቶች።', om: 'Tajaajiloota hojii, mana, daldalaa fi hawaasaaf.', ti: 'ኣገልግሎታት ስራሕ፣ ገዛ፣ ንግዲን ማሕበረሰብን።', so: 'Adeegyada shaqada, guryaha, ganacsiga iyo bulshada.', ar: 'خدمات للعمل والمنازل والأعمال والمجتمع.', sw: 'Huduma za kazi, nyumba, biashara na jamii.',
  },
  'Explore AfroLife’s connected services. Install the app for a home-screen shortcut and a cached public shell; sign in to access account-specific tools.': {
    am: 'የAfroLife ተያያዥ አገልግሎቶችን ይመልከቱ። ለመነሻ ማያ አቋራጭና ለተቀመጠ የሕዝብ ገጽ መተግበሪያውን ይጫኑ፤ የመለያዎን መሣሪያዎች ለመጠቀም ይግቡ።',
    om: 'Tajaajiloota walitti hidhaman AfroLife ilaalaa. Mallattoo fuula jalqabaa fi fuula uummataa kuufameef appii fe’aa; meeshaalee herrega keessaniif seenaa.',
    ti: 'ኣገልግሎታት AfroLife ርኣዩ። ንመልክዕ መነሻን ዝተኻዘነ ገጽ ህዝብን መተግበሪ ጽዓኑ፤ ናይ ሕሳብ መሳርሒታት ንምጥቃም እቶ።',
    so: 'Baadh adeegyada AfroLife ee isku xiran. Ku rakib app-ka si aad u hesho astaan shaashadda hore iyo bog dadweyne oo kaydsan; gal si aad u hesho qalabka akoonkaaga.',
    ar: 'استكشف خدمات AfroLife المترابطة. ثبّت التطبيق لاختصار الشاشة الرئيسية والواجهة العامة المحفوظة؛ سجّل الدخول للوصول إلى أدوات حسابك.',
    sw: 'Chunguza huduma zilizounganishwa za AfroLife. Sakinisha programu kwa njia ya mkato ya skrini ya nyumbani na ukurasa wa umma uliohifadhiwa; ingia ili kufikia zana za akaunti yako.',
  },
  'SERVICE MENU': {
    am: 'የአገልግሎት ምናሌ', om: 'TARREE TAJAAJILAA', ti: 'ምናሌ ኣገልግሎት', so: 'LIISKA ADEEGYADA', ar: 'قائمة الخدمات', sw: 'MENYU YA HUDUMA',
  },
  'One app, useful services': {
    am: 'አንድ መተግበሪያ፣ ጠቃሚ አገልግሎቶች', om: 'Appii tokko, tajaajiloota faayidaa qaban', ti: 'ሓደ መተግበሪ፣ ጠቓሚ ኣገልግሎታት', so: 'Hal app, adeegyo waxtar leh', ar: 'تطبيق واحد وخدمات مفيدة', sw: 'Programu moja, huduma zenye manufaa',
  },
  'Choose a service to continue': {
    am: 'ለመቀጠል አገልግሎት ይምረጡ', om: 'Itti fufuuf tajaajila filadhaa', ti: 'ንምቕጻል ኣገልግሎት ምረጹ', so: 'Dooro adeeg si aad u sii wadato', ar: 'اختر خدمة للمتابعة', sw: 'Chagua huduma ili kuendelea',
  },
  'Homes & rentals': {
    am: 'ቤቶችና ኪራዮች', om: 'Manneen fi kiraa', ti: 'ገዛውቲን ክራይን', so: 'Guryaha iyo kirada', ar: 'المنازل والإيجارات', sw: 'Nyumba na upangishaji',
  },
  'Browse property listings, connect landlords and tenants, and manage rent workflows where enabled.': {
    am: 'የንብረት ዝርዝሮችን ይመልከቱ፣ አከራዮችንና ተከራዮችን ያገናኙ፣ ከነቃም የኪራይ ሥራዎችን ያስተዳድሩ።', om: 'Tarree qabeenyaa ilaalaa, abbootii manaa fi kireeffattoota wal qunnamsiisaa, hojii kiraa bulchaa.', ti: 'ዝርዝራት ንብረት ርኣዩ፣ ኣካረይትን ተኻረይትን ኣራኽቡ፣ ስራሕ ክራይ ኣመሓድሩ።', so: 'Eeg liisaska hantida, isku xir milkiilayaasha iyo kiraystayaasha, maamulna shaqada kirada marka la hawlgeliyo.', ar: 'تصفّح قوائم العقارات، واربط المُلّاك بالمستأجرين، وأدر إجراءات الإيجار عند تفعيلها.', sw: 'Vinjari matangazo ya mali, unganisha wamiliki na wapangaji, na usimamie kodi inapowezeshwa.',
  },
  'Marketplace': {
    am: 'የገበያ ቦታ', om: 'Gabaa', ti: 'ዕዳጋ', so: 'Suuqa', ar: 'السوق', sw: 'Soko',
  },
  'Discover products and services from registered sellers and local businesses.': {
    am: 'ከተመዘገቡ ሻጮችና አካባቢያዊ ንግዶች ምርቶችንና አገልግሎቶችን ያግኙ።', om: 'Oomishaalee fi tajaajiloota gurgurtoota galmaa’anii fi daldala naannoo irraa argadhaa.', ti: 'ካብ ዝተመዝገቡ ሻየጥን ናይ ከባቢ ንግድን ፍርያትን ኣገልግሎታትን ርኸቡ።', so: 'Ka hel badeecooyin iyo adeegyo iibiyeyaasha diiwaangashan iyo ganacsiyada deegaanka.', ar: 'اكتشف المنتجات والخدمات من البائعين المسجلين والشركات المحلية.', sw: 'Gundua bidhaa na huduma kutoka kwa wauzaji waliosajiliwa na biashara za eneo lako.',
  },
  'Workforce': {
    am: 'የሠራተኛ ኃይል', om: 'Hojjettoota', ti: 'ሓይሊ ሰራሕተኛ', so: 'Shaqaalaha', ar: 'القوى العاملة', sw: 'Wafanyakazi',
  },
  'Find work opportunities, verified worker profiles, and employer service requests.': {
    am: 'የሥራ ዕድሎችን፣ የተረጋገጡ የሠራተኛ መገለጫዎችንና የአሠሪ ጥያቄዎችን ያግኙ።', om: 'Carraa hojii, piroofaayila hojjettootaa mirkanaa’an fi gaaffii hojii kennitootaa argadhaa.', ti: 'ዕድላት ስራሕ፣ ዝተረጋገጹ መግለጺታት ሰራሕተኛን ሕቶታት ኣስራሕቲን ርኸቡ።', so: 'Hel fursadaha shaqada, xogta shaqaalaha la xaqiijiyey iyo codsiyada loo-shaqeeyaha.', ar: 'اعثر على فرص العمل وملفات العاملين المتحقق منهم وطلبات أصحاب العمل.', sw: 'Pata fursa za kazi, wasifu wa wafanyakazi waliothibitishwa na maombi ya waajiri.',
  },
  'AfroLife Edir': {
    am: 'AfroLife እድር', om: 'Edir AfroLife', ti: 'Edir AfroLife', so: 'AfroLife Edir', ar: 'إدير AfroLife', sw: 'AfroLife Edir',
  },
  'SACCO / MFI': {
    am: 'ህብረት ሥራ ቁጠባ / ፋይናንስ ተቋም', om: 'SACCO / MFI', ti: 'SACCO / MFI', so: 'SACCO / MFI', ar: 'تعاونية ادخار وائتمان / مؤسسة تمويل أصغر', sw: 'SACCO / MFI',
  },
  'Business entities': {
    am: 'የንግድ ድርጅቶች', om: 'Dhaabbilee daldalaa', ti: 'ትካላት ንግዲ', so: 'Hay’adaha ganacsiga', ar: 'الكيانات التجارية', sw: 'Mashirika ya biashara',
  },
  'Select an entity book. Parent access only exposes consolidated totals unless you also have accounting access to child books.': {
    am: 'የድርጅት መዝገብ ይምረጡ። የወላጅ ድርጅት መዳረሻ የተጠቃለሉ ድምሮችን ብቻ ያሳያል፤ የልጅ ድርጅቶች መዳረሻ ካለዎት በስተቀር።', om: 'Galmee dhaabbataa filadhaa. Hayyamni dhaabbata abbaa waliigala walitti qabame qofa agarsiisa; yoo galmee dhaabbata ijoollee argachuuf hayyama qabaattan malee.', ti: 'መዝገብ ትካል ምረጹ። መእተዊ ወላዲ ጠቕላላ ድምር ጥራይ የርኢ፤ ናብ መዝገብ ትካላት ውሉድ መእተዊ እንተሃልዩኩም ግን ኣይኮነን።', so: 'Dooro buugga hay’adda. Helitaanka hay’adda waalidku wuxuu muujinayaa wadarta la isku geeyey oo keliya ilaa aad sidoo kale u leedahay helitaanka buugaagta hay’adaha hoose.', ar: 'اختر دفتر الكيان. وصول الكيان الرئيسي يعرض الإجماليات المجمعة فقط ما لم يكن لديك وصول محاسبي إلى دفاتر الكيانات التابعة.', sw: 'Chagua kitabu cha taasisi. Ufikiaji wa taasisi mama huonyesha jumla zilizounganishwa tu isipokuwa pia uwe na ufikiaji wa vitabu vya taasisi ndogo.',
  },
  'Entity or business name': {
    am: 'የድርጅት ወይም የንግድ ስም', om: 'Maqaa dhaabbataa ykn daldalaa', ti: 'ስም ትካል ወይ ንግዲ', so: 'Magaca hay’adda ama ganacsiga', ar: 'اسم الكيان أو النشاط التجاري', sw: 'Jina la taasisi au biashara',
  },
  'Entity type': {
    am: 'የድርጅት ዓይነት', om: 'Gosa dhaabbataa', ti: 'ዓይነት ትካል', so: 'Nooca hay’adda', ar: 'نوع الكيان', sw: 'Aina ya taasisi',
  },
  'Base currency': {
    am: 'መሠረታዊ ምንዛሬ', om: 'Maallaqa bu’uuraa', ti: 'መሰረታዊ ባጤራ', so: 'Lacagta aasaasiga ah', ar: 'العملة الأساسية', sw: 'Sarafu ya msingi',
  },
  'Create child entity': {
    am: 'ንዑስ ድርጅት ፍጠር', om: 'Dhaabbata damee uumaa', ti: 'ንኡስ ትካል ፍጠር', so: 'Samee hay’ad hoose', ar: 'إنشاء كيان تابع', sw: 'Unda taasisi tanzu',
  },
  'Assign entity access': {
    am: 'የድርጅት መዳረሻ መድብ', om: 'Hayyama dhaabbataa ramadi', ti: 'መእተዊ ትካል ምድባ', so: 'U qoondee gelitaanka hay’adda', ar: 'تعيين صلاحية الوصول إلى الكيان', sw: 'Weka ruhusa ya taasisi',
  },
  'AfroLife user UUID': {
    am: 'የAfroLife ተጠቃሚ UUID', om: 'UUID fayyadamaa AfroLife', ti: 'UUID ተጠቃሚ AfroLife', so: 'UUID-ga isticmaalaha AfroLife', ar: 'معرّف مستخدم AfroLife', sw: 'UUID ya mtumiaji wa AfroLife',
  },
  'Accounting role': {
    am: 'የሂሳብ ሚና', om: 'Gahee herregaa', ti: 'ሚና ሒሳብ', so: 'Doorka xisaabaadka', ar: 'الدور المحاسبي', sw: 'Jukumu la uhasibu',
  },
  'Create journal entry': {
    am: 'የጆርናል መዝገብ ፍጠር', om: 'Galmee gaazexaa uumaa', ti: 'መዝገብ ጆርናል ፍጠር', so: 'Samee gelin joornaal', ar: 'إنشاء قيد يومية', sw: 'Unda ingizo la jarida',
  },
  'Chart of accounts': {
    am: 'የሂሳብ መዝገብ ዝርዝር', om: 'Tarree herregaawwan', ti: 'ዝርዝር ሕሳባት', so: 'Jadwalka xisaabaadka', ar: 'دليل الحسابات', sw: 'Orodha ya akaunti',
  },
  'Journal register': {
    am: 'የጆርናል መዝገብ ማውጫ', om: 'Galmee gaazexaa', ti: 'መዝገብ ጆርናል', so: 'Diiwaanka joornaalka', ar: 'سجل القيود اليومية', sw: 'Rejesta ya majarida',
  },
  'Accounting periods': {
    am: 'የሂሳብ ጊዜያት', om: 'Yeroo herregaa', ti: 'እዋናት ሒሳብ', so: 'Xilliyada xisaabaadka', ar: 'الفترات المحاسبية', sw: 'Vipindi vya uhasibu',
  },
  'Entity reports': {
    am: 'የድርጅት ሪፖርቶች', om: 'Gabaasa dhaabbataa', ti: 'ጸብጻባት ትካል', so: 'Warbixinnada hay’adda', ar: 'تقارير الكيان', sw: 'Ripoti za taasisi',
  },
  'Unit rent (ETB, optional)': {
    am: 'የክፍል ኪራይ (ብር፣ አማራጭ)', om: 'Kiraa kutaa (ETB, filannoo)', ti: 'ክራይ ክፍሊ (ETB፣ ኣማራጺ)', so: 'Kirada qaybta (ETB, ikhtiyaari)', ar: 'إيجار الوحدة (ETB، اختياري)', sw: 'Kodi ya chumba (ETB, hiari)',
  },
  'Financial Services': {
    am: 'የፋይናንስ አገልግሎቶች', om: 'Tajaajila Faayinaansii', ti: 'ኣገልግሎታት ፋይናንስ', so: 'Adeegyada Maaliyadda', ar: 'الخدمات المالية', sw: 'Huduma za Fedha',
  },
  'Global BI': {
    am: 'ዓለም አቀፍ የንግድ ትንታኔ', om: 'Xiinxala Daldalaa Addunyaa', ti: 'ትንተና ንግዲ ዓለም', so: 'Falanqaynta Ganacsiga Caalamiga', ar: 'ذكاء الأعمال العالمي', sw: 'Uchanganuzi wa Biashara wa Kimataifa',
  },
  'Admin & review': {
    am: 'አስተዳደር እና ግምገማ', om: 'Bulchiinsa fi gamaaggama', ti: 'ምምሕዳርን ግምገማን', so: 'Maamul iyo dib-u-eegis', ar: 'الإدارة والمراجعة', sw: 'Usimamizi na ukaguzi',
  },
  'Service status': {
    am: 'የአገልግሎት ሁኔታ', om: 'Haala tajaajilaa', ti: 'ኩነታት ኣገልግሎት', so: 'Xaaladda adeegga', ar: 'حالة الخدمة', sw: 'Hali ya huduma',
  },
  'Workspace sections': {
    am: 'የሥራ ቦታ ክፍሎች', om: 'Kutaa iddoo hojii', ti: 'ክፍልታት ቦታ ስራሕ', so: 'Qaybaha goobta shaqada', ar: 'أقسام مساحة العمل', sw: 'Sehemu za nafasi ya kazi',
  },
  'All sections': {
    am: 'ሁሉም ክፍሎች', om: 'Kutaa hunda', ti: 'ኩሎም ክፍልታት', so: 'Dhammaan qaybaha', ar: 'كل الأقسام', sw: 'Sehemu zote',
  },
  'Your workspace': {
    am: 'የእርስዎ የሥራ ቦታ', om: 'Iddoo hojii keessan', ti: 'ቦታ ስራሕኩም', so: 'Goobtaada shaqada', ar: 'مساحة عملك', sw: 'Nafasi yako ya kazi',
  },
  'Refresh': {
    am: 'አድስ', om: 'Haaromsi', ti: 'ኣሐድስ', so: 'Cusboonaysii', ar: 'تحديث', sw: 'Onyesha upya',
  },
  'Your activity': {
    am: 'የእርስዎ እንቅስቃሴ', om: 'Sochii keessan', ti: 'ንጥፈታትኩም', so: 'Hawlahaaga', ar: 'نشاطك', sw: 'Shughuli zako',
  },
  'Your latest records and work in progress.': {
    am: 'የቅርብ ጊዜ መዝገቦችዎ እና በሂደት ላይ ያሉ ሥራዎች።', om: 'Galmeewwan dhiheenyaa fi hojii adeemsarra jiru.', ti: 'ናይ ቀረባ ግዜ መዝገባትኩምን ኣብ ምክያድ ዘሎ ስራሕን።', so: 'Diiwaannadaadii ugu dambeeyay iyo shaqada socota.', ar: 'أحدث سجلاتك والأعمال قيد التنفيذ.', sw: 'Rekodi zako za hivi karibuni na kazi zinazoendelea.',
  },
  'Overview': {
    am: 'አጠቃላይ እይታ', om: 'Cuunfaa', ti: 'ሓፈሻዊ ርእይቶ', so: 'Guudmar', ar: 'نظرة عامة', sw: 'Muhtasari',
  },
  'Leads': {
    am: 'ደንበኞች', om: 'Maamiltoota', ti: 'መራሕቲ', so: 'Macaamiisha', ar: 'العملاء المحتملون', sw: 'Wateja tarajiwa',
  },
  'Workers': {
    am: 'ሠራተኞች', om: 'Hojjettoota', ti: 'ሰራሕተኛታት', so: 'Shaqaalaha', ar: 'العاملون', sw: 'Wafanyakazi',
  },
  'Requests & matching': {
    am: 'ጥያቄዎች እና ማዛመድ', om: 'Gaaffii fi walitti fiduu', ti: 'ሕቶታትን ምዝማድን', so: 'Codsiyada iyo iswaafajinta', ar: 'الطلبات والمطابقة', sw: 'Maombi na ulinganishaji',
  },
  'Training & support': {
    am: 'ሥልጠና እና ድጋፍ', om: 'Leenjii fi deeggarsa', ti: 'ስልጠናን ደገፍን', so: 'Tababar iyo taageero', ar: 'التدريب والدعم', sw: 'Mafunzo na usaidizi',
  },
  'Properties': {
    am: 'ንብረቶች', om: 'Qabeenya', ti: 'ንብረታት', so: 'Hantida', ar: 'العقارات', sw: 'Mali',
  },
  'Contracts': {
    am: 'ውሎች', om: 'Waliigalteewwan', ti: 'ውዕላት', so: 'Heshiisyada', ar: 'العقود', sw: 'Mikataba',
  },
  'Commissions': {
    am: 'ኮሚሽኖች', om: 'Komishinii', ti: 'ኮሚሽናት', so: 'Guddiyada', ar: 'العمولات', sw: 'Kamisheni',
  },
  'Agent management': {
    am: 'የወኪል አስተዳደር', om: 'Bulchiinsa bakka bu’aa', ti: 'ምምሕዳር ወኪል', so: 'Maamulka wakiilka', ar: 'إدارة الوكلاء', sw: 'Usimamizi wa mawakala',
  },
  'Rent & deposits': {
    am: 'ኪራይ እና ተቀማጭ', om: 'Kiraa fi wabii', ti: 'ክራይን ተቐማጢን', so: 'Kirada iyo deebaajiga', ar: 'الإيجار والودائع', sw: 'Kodi na amana',
  },
  'AfroLife Edir': {
    am: 'AfroLife እድር', om: 'Edir AfroLife', ti: 'Edir AfroLife', so: 'AfroLife Edir', ar: 'إدير AfroLife', sw: 'AfroLife Edir',
  },
  'Privacy requests & incidents': {
    am: 'የግላዊነት ጥያቄዎች እና ክስተቶች', om: 'Gaaffii dhuunfaa fi taateewwan', ti: 'ሕቶታት ብሕታዊነትን ፍጻመታትን', so: 'Codsiyada gaarka ah iyo dhacdooyinka', ar: 'طلبات الخصوصية والحوادث', sw: 'Maombi ya faragha na matukio',
  },
  'Security': {
    am: 'ደህንነት', om: 'Nageenya', ti: 'ድሕነት', so: 'Amniga', ar: 'الأمان', sw: 'Usalama',
  },
  'SACCO / MFI workspace': {
    am: 'የSACCO / MFI የሥራ ቦታ', om: 'Iddoo hojii SACCO / MFI', ti: 'ቦታ ስራሕ SACCO / MFI', so: 'Goobta shaqada SACCO / MFI', ar: 'مساحة عمل SACCO / MFI', sw: 'Nafasi ya kazi ya SACCO / MFI',
  },
  'AfroLife Edir workspace': {
    am: 'የAfroLife Edir የሥራ ቦታ', om: 'Iddoo hojii Edir AfroLife', ti: 'ቦታ ስራሕ Edir AfroLife', so: 'Goobta shaqada AfroLife Edir', ar: 'مساحة عمل إدير AfroLife', sw: 'Nafasi ya kazi ya AfroLife Edir',
  },
  'Insurance information': {
    am: 'የኢንሹራንስ መረጃ', om: 'Odeeffannoo inshuraansii', ti: 'ሓበሬታ ውሕስነት', so: 'Macluumaadka caymiska', ar: 'معلومات التأمين', sw: 'Taarifa za bima',
  },
  'Signed in as {{role}}. Your access is limited to your assigned role and territory.': {
    am: 'እንደ {{role}} ገብተዋል። መዳረሻዎ በተመደበልዎ ሚናና አካባቢ ብቻ የተገደበ ነው።', om: '{{role}} taatanii seentani. Seensaan keessan gahee fi naannoo isiniif kenname qofaan daangeffama.', ti: 'ከም {{role}} ኣቲኹም። መእተዊኹም ብሚናን ከባቢን ዝተመደበልኩም ጥራይ ይውሰን።', so: 'Waxaad ku gashay {{role}}. Gelitaankaagu wuxuu ku kooban yahay doorka iyo deegaanka laguu qoondeeyey.', ar: 'تم تسجيل الدخول بصفتك {{role}}. يقتصر وصولك على الدور والمنطقة المخصصين لك.', sw: 'Umeingia kama {{role}}. Ufikiaji wako una mipaka ya jukumu na eneo ulilopangiwa.',
  },
};
for (const [message, translations] of Object.entries(publicSurfaceTranslations)) {
  catalogs.en[message] ??= message;
  for (const [locale, translation] of Object.entries(translations)) catalogs[locale][message] = translation;
}
const localeStorageKey = 'afrolife.locale';
const supportedLocales = Object.keys(localeNames);
const storedLocale = localStorage.getItem(localeStorageKey);
const browserLocale = navigator.languages?.find((language) => supportedLocales.includes(language.split('-')[0]))?.split('-')[0];
let currentLocale = supportedLocales.includes(storedLocale) ? storedLocale : browserLocale ?? 'en';
let onLocaleChange = () => {};
const originalText = new WeakMap();
const originalAttributes = new WeakMap();

export function t(message, values = {}) {
  const translated = catalogs[currentLocale][message] ?? catalogs.en[message] ?? message;
  return translated.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(values[name] ?? ''));
}

export function setLocalizedNodeText(textNode, message, values = {}) {
  originalText.set(textNode, { message, values });
  textNode.nodeValue = t(message, values);
}

function applyStaticTranslations(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    const parent = textNode.parentElement;
    if (!parent || ['SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
    if (!originalText.has(textNode)) originalText.set(textNode, { message: textNode.nodeValue, values: {} });
    const { message, values } = originalText.get(textNode);
    const trimmed = message.trim();
    if (!trimmed) continue;
    const translation = t(trimmed, values);
    const leading = message.match(/^\s*/)?.[0] ?? '';
    const trailing = message.match(/\s*$/)?.[0] ?? '';
    textNode.nodeValue = `${leading}${translation}${trailing}`;
  }

  root.querySelectorAll('[placeholder], [aria-label], [title]').forEach((element) => {
    let sources = originalAttributes.get(element);
    if (!sources) {
      sources = {};
      originalAttributes.set(element, sources);
    }
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      if (!element.hasAttribute(attribute)) continue;
      if (!(attribute in sources)) sources[attribute] = element.getAttribute(attribute);
      element.setAttribute(attribute, t(sources[attribute]));
    }
  });
}

export function translateContent(root) {
  applyStaticTranslations(root);
}

export function initializeLocale(onChange) {
  onLocaleChange = onChange;
  const selector = document.querySelector('#language-select');
  selector.value = currentLocale;
  selector.addEventListener('change', () => {
    if (!supportedLocales.includes(selector.value)) return;
    currentLocale = selector.value;
    localStorage.setItem(localeStorageKey, currentLocale);
    document.documentElement.lang = currentLocale;
    document.documentElement.dir = currentLocale === 'ar' ? 'rtl' : 'ltr';
    applyStaticTranslations();
    onLocaleChange(currentLocale);
  });
  document.documentElement.lang = currentLocale;
  document.documentElement.dir = currentLocale === 'ar' ? 'rtl' : 'ltr';
  applyStaticTranslations();
}

export { localeNames };
