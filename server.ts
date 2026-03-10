import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;

try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle escaped newlines in the private key
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    db = admin.firestore();
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("Firebase Admin credentials not found. Falling back to in-memory storage (data will reset on restart).");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error);
}

const initialEmotions = [
  { name: "嬉しい", meaning: "自分の希望が叶ったり、良いことが起きたりして喜ばしい気持ち。", example: "欲しかったプレゼントをもらって嬉しい。" },
  { name: "悲しい", meaning: "心が痛んで泣きたくなるような気持ち。", example: "大切にしていたペットが亡くなって悲しい。" },
  { name: "寂しい", meaning: "仲間や相手がいなくて心細く、満たされない気持ち。", example: "友人が遠くに引っ越してしまって寂しい。" },
  { name: "楽しい", meaning: "気分が良く、愉快で明るい気持ち。", example: "友達と一緒に遊園地で遊んでいて楽しい。" },
  { name: "穏やか", meaning: "気持ちが落ち着いていて、静かで安らかな状態。", example: "休日の朝、コーヒーを飲みながら穏やかな時間を過ごす。" },
  { name: "羨ましい", meaning: "他人の恵まれた状況を見て、自分もそうなりたいと願う気持ち。", example: "宝くじに当たった友人が羨ましい。" },
  { name: "イライラする", meaning: "思い通りにならず、神経が高ぶって落ち着かない気持ち。", example: "電車が遅延して約束の時間に遅れそうでイライラする。" },
  { name: "妬ましい", meaning: "他人の幸せや成功が憎らしくて、嫉妬する気持ち。", example: "自分より評価されている同僚が妬ましい。" },
  { name: "焦り", meaning: "早くしなければと気が急いて、落ち着かない気持ち。", example: "締め切りが迫っているのに仕事が終わらず焦りを感じる。" },
  { name: "喜び", meaning: "心が満たされて、嬉しく楽しいと感じる気持ち。", example: "長年の努力が実り、合格通知を受け取って喜びを噛み締める。" },
  { name: "申し訳ない", meaning: "自分の過ちや不足により、相手にすまないと思う気持ち。", example: "待ち合わせに遅刻してしまい、友人に申し訳ないと思う。" },
  { name: "不安", meaning: "この先どうなるか分からず、心配で落ち着かない気持ち。", example: "明日の重要なプレゼンがうまくいくか不安だ。" },
  { name: "興奮", meaning: "感情が高ぶり、熱狂して落ち着かない状態。", example: "好きなアーティストのライブが始まる直前で興奮する。" },
  { name: "恐怖", meaning: "恐ろしいものや危険を感じて、ひどく怯える気持ち。", example: "暗い夜道を一人で歩いていて恐怖を感じる。" },
  { name: "ざわめき", meaning: "心が落ち着かず、何かが起こりそうで落ち着かない気持ち。", example: "不穏なニュースを聞いて、胸の奥にざわめきを覚える。" },
  { name: "愛おしい", meaning: "たまらなく可愛く、大切にしたいと思う気持ち。", example: "すやすやと眠る我が子の寝顔が愛おしい。" },
  { name: "尊い", meaning: "非常に価値があり、大切で崇高だと感じる気持ち。", example: "推しのアイドルが頑張っている姿が尊い。" },
  { name: "ありがたい", meaning: "他人の好意や恵まれた状況に対して、感謝したい気持ち。", example: "困っている時に助けてくれた同僚がありがたい。" },
  { name: "切ない", meaning: "悲しさや恋しさで、胸が締め付けられるような気持ち。", example: "片思いの相手が別の人と笑っているのを見て切ない。" },
  { name: "腹立たしい", meaning: "怒りを抑えきれず、むかむかとする気持ち。", example: "理不尽な理由で怒られて腹立たしい。" },
  { name: "残念", meaning: "期待通りにならず、心残りやがっかりする気持ち。", example: "楽しみにしていた旅行が雨で中止になって残念だ。" },
  { name: "恥ずかしい", meaning: "自分の失敗や欠点を知られ、顔から火が出るような気持ち。", example: "大勢の前で派手に転んでしまい恥ずかしい。" },
  { name: "虚しい", meaning: "中身や価値がなく、心が満たされない空っぽな気持ち。", example: "一日中何もせずに過ごしてしまい、虚しい気持ちになる。" },
  { name: "安心感", meaning: "心配や不安がなくなり、心が落ち着いている状態。", example: "家族の声を聞いて、ほっと安心感を覚える。" },
  { name: "心地よさ", meaning: "感覚的に気持ちよく、リラックスできる状態。", example: "春の暖かい日差しを浴びて心地よさを感じる。" },
  { name: "嫌悪", meaning: "非常に嫌って、憎み避けたがる気持ち。", example: "不正を平気で行う人に対して強い嫌悪を抱く。" },
  { name: "怒り", meaning: "許せないことに対して、激しく腹を立てる気持ち。", example: "約束を何度も破られて怒りが爆発する。" },
  { name: "満足感", meaning: "望みが叶ったり、十分に満たされたりして気分が良いこと。", example: "美味しいディナーを食べて満足感に浸る。" },
  { name: "嫌だ", meaning: "受け入れたくない、避けたいと強く思う気持ち。", example: "明日からまた満員電車に乗るのは嫌だ。" },
  { name: "好き", meaning: "心惹かれ、好ましく思って大切にしたい気持ち。", example: "ずっと前からあなたのことが好きでした。" },
  { name: "何もしたくない", meaning: "気力が湧かず、一切の行動を起こすのが億劫な状態。", example: "疲れ果てて、休日は何もしたくない。" },
  { name: "暴れたい", meaning: "抑えきれない感情を発散させるため、激しく動きたい気持ち。", example: "ストレスが限界に達し、大声を出して暴れたい気分だ。" },
  { name: "不満", meaning: "現状に満足できず、納得がいかない気持ち。", example: "給料が仕事量に見合っていないことに不満を持つ。" },
  { name: "絶望", meaning: "希望が全くなくなり、どうしようもないと諦める気持ち。", example: "全ての努力が水の泡となり、絶望の淵に立たされる。" },
  { name: "諦め", meaning: "これ以上は無理だと見切りをつけ、思い切る気持ち。", example: "何度挑戦しても勝てず、ついに諦めの境地に達する。" },
  { name: "罪悪感", meaning: "自分が悪いことをした、罪を犯したと責める気持ち。", example: "ダイエット中なのに深夜にラーメンを食べてしまい罪悪感を覚える。" },
  { name: "達成感", meaning: "目標を成し遂げたことで得られる、満足と喜びの気持ち。", example: "フルマラソンを完走して、大きな達成感に包まれる。" },
  { name: "にくい", meaning: "ひどく嫌で、許せないと強く思う気持ち。", example: "自分を裏切ったかつての親友がにくい。" },
  { name: "悔しい", meaning: "物事がうまくいかず、腹立たしく残念に思う気持ち。", example: "あと一歩のところで試合に負けて悔しい。" },
  { name: "おかしい（可笑しい）", meaning: "滑稽で笑いたくなるような、愉快な気持ち。", example: "友達の冗談がツボに入ってしまい、おかしくてたまらない。" },
  { name: "充実感", meaning: "中身が満ちていて、生き生きとしたやりがいを感じる気持ち。", example: "新しいプロジェクトを任され、毎日充実感を持って働いている。" },
  { name: "嫉み", meaning: "他人の幸せや長所をうらやみ、憎らしく思う気持ち。", example: "才能あふれる後輩に対して嫉みを抱いてしまう。" },
  { name: "後悔", meaning: "過去の自分の行いや選択を、後になって悔やむ気持ち。", example: "あの時もっと勉強しておけばよかったと後悔する。" },
  { name: "恨み", meaning: "ひどい仕打ちを受けたことに対し、不満や憎しみを持ち続ける気持ち。", example: "いじめられた過去の恨みを今でも忘れていない。" },
  { name: "自己卑下", meaning: "自分自身を劣ったものとして、過剰に低く評価する気持ち。", example: "「どうせ私なんて」と自己卑下ばかりしてしまう。" },
  { name: "慈悲", meaning: "他人の苦しみを取り除き、楽を与えようとする思いやりの心。", example: "困窮している人々に対し、慈悲の心で寄付をする。" },
  { name: "心細く寂しい", meaning: "頼るものがなく不安で、孤独を感じる気持ち。", example: "見知らぬ土地に一人で引っ越してきて、心細く寂しい。" },
  { name: "安らか", meaning: "悩みや苦しみがなく、穏やかで落ち着いている状態。", example: "すべての仕事を終え、安らかな気持ちで眠りにつく。" },
  { name: "失望", meaning: "期待が外れてがっかりし、希望を失う気持ち。", example: "信じていた人の裏切りを知り、深く失望する。" },
  { name: "無力感", meaning: "自分には状況を変える力がないと思い知らされ、落ち込む気持ち。", example: "災害のニュースを見て、何もできない自分に無力感を覚える。" },
  { name: "不愉快", meaning: "嫌な気分になり、面白くない気持ち。", example: "店員の態度の悪さに不愉快な思いをした。" },
  { name: "驚き", meaning: "予期しない出来事に遭遇し、ハッとする気持ち。", example: "サプライズパーティーを開いてもらい、驚きと喜びでいっぱいだ。" },
  { name: "情けない", meaning: "自分の不甲斐なさや惨めさに、がっかりする気持ち。", example: "こんな簡単なミスをしてしまう自分が情けない。" },
  { name: "煩わしい", meaning: "面倒で気が重く、関わりたくないと思う気持ち。", example: "複雑な人間関係のトラブルに巻き込まれ、煩わしい。" }
];

// Fallback in-memory storage
let inMemoryEmotions = initialEmotions.map((e, index) => ({
  id: `mem-${index}`,
  ...e,
  createdAt: new Date().toISOString()
}));

async function seedDatabase() {
  if (!db) return;
  try {
    const snapshot = await db.collection("emotions").limit(1).get();
    if (snapshot.empty) {
      console.log("Seeding initial emotions to Firestore...");
      const batch = db.batch();
      for (const emotion of initialEmotions) {
        const docRef = db.collection("emotions").doc();
        batch.set(docRef, {
          name: emotion.name,
          meaning: emotion.meaning,
          example: emotion.example,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
      console.log("Seeding complete.");
    }
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

// Start seeding if DB is initialized
seedDatabase();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/emotions", async (req, res) => {
    if (!db) {
      return res.json(inMemoryEmotions);
    }
    try {
      const snapshot = await db.collection("emotions").orderBy("createdAt", "asc").get();
      const emotions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      res.json(emotions);
    } catch (error) {
      console.error("Failed to fetch emotions:", error);
      res.status(500).json({ error: "Failed to fetch emotions" });
    }
  });

  app.get("/api/emotions/:id/details", async (req, res) => {
    const id = req.params.id;
    if (!db) {
      const emotion = inMemoryEmotions.find(e => e.id === id);
      if (!emotion) return res.status(404).json({ error: "Emotion not found" });
      return res.json(emotion);
    }
    try {
      const doc = await db.collection("emotions").doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Emotion not found" });
      }
      res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch emotion details" });
    }
  });

  app.put("/api/emotions/:id", async (req, res) => {
    const id = req.params.id;
    const { meaning, example } = req.body;
    
    if (!db) {
      const index = inMemoryEmotions.findIndex(e => e.id === id);
      if (index === -1) return res.status(404).json({ error: "Emotion not found" });
      inMemoryEmotions[index] = { ...inMemoryEmotions[index], meaning, example };
      return res.json(inMemoryEmotions[index]);
    }

    try {
      await db.collection("emotions").doc(id).update({
        meaning,
        example
      });
      const updatedDoc = await db.collection("emotions").doc(id).get();
      res.json({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (error) {
      res.status(500).json({ error: "Failed to update emotion" });
    }
  });

  app.post("/api/emotions", async (req, res) => {
    const { name, meaning, example } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Invalid emotion name" });
    }

    if (!db) {
      if (inMemoryEmotions.some(e => e.name === name.trim())) {
        return res.status(409).json({ error: "Emotion already exists" });
      }
      const newEmotion = {
        id: `mem-${Date.now()}`,
        name: name.trim(),
        meaning: meaning || null,
        example: example || null,
        createdAt: new Date().toISOString()
      };
      inMemoryEmotions.push(newEmotion);
      return res.status(201).json(newEmotion);
    }

    try {
      // Check for duplicates
      const snapshot = await db.collection("emotions").where("name", "==", name.trim()).get();
      if (!snapshot.empty) {
        return res.status(409).json({ error: "Emotion already exists" });
      }

      const docRef = await db.collection("emotions").add({
        name: name.trim(),
        meaning: meaning || null,
        example: example || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const newDoc = await docRef.get();
      res.status(201).json({ id: newDoc.id, ...newDoc.data() });
    } catch (error) {
      res.status(500).json({ error: "Failed to add emotion" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
