# تشغيل السيستم على جهازك ومشاركته برابط

السيستم بيشتغل على جهازك، و**Cloudflare Tunnel** بيديك رابط `https://...trycloudflare.com` تبعته لأي حد، فيفتح السيستم من أي مكان. مجاني ومن غير حساب.

> طول ما الرابط شغال، **جهازك لازم يفضل مفتوح** والبرامج التلاتة شغالة.
> الرابط بيتغير كل مرة تشغّل فيها الـ tunnel. لو عايز رابط ثابت، اعمل حساب Cloudflare مجاني واربطه بدومين (اتكلم معايا ساعتها).

## مرة واحدة: التجهيز

1. ثبّت **Node 22** و**Docker Desktop**.
2. ثبّت **cloudflared**:
   - Windows (PowerShell): نزّله مباشرة في فولدر المشروع:
     `Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe`
     وبعدين بتشغّله بـ `.\cloudflared.exe` بدل `cloudflared`.
     (أو `winget install --id Cloudflare.cloudflared` لو winget موجود عندك.)
   - Mac: `brew install cloudflared`
3. نزّل الكود وجهّز الداتابيز والـ API زي `README.md`:

```bash
git clone https://github.com/MohammedEsmaill/hammer-logistics.git
cd hammer-logistics
docker compose up -d                 # PostgreSQL على جهازك

cd apps/api
cp .env.example .env                 # افتحه واكتب القيم (تحت)
npm install                          # بيعمل prisma generate تلقائي
npx prisma migrate deploy
npx prisma db seed                   # الأدوار والقوائم وحساب الـ CEO
npm run build

cd ../web
npm install
```

القيم المهمة في `apps/api/.env`:

```
DATABASE_URL="postgresql://hammer:hammer@localhost:5432/hammer_logistics?schema=public"
JWT_ACCESS_SECRET="..."      # 64 حرف عشوائي (openssl rand -hex 32)
JWT_REFRESH_SECRET="..."     # قيمة تانية مختلفة
SEED_CEO_EMAIL="ceo@hammerline.com"
SEED_CEO_PASSWORD="..."      # كلمة سر قوية
TRUST_PROXY_HOPS=1           # علشان حماية الدخول تشوف جهاز كل مستخدم مش جهازك
```

## كل مرة: التشغيل والمشاركة (Windows)

في فولدر المشروع فيه ملفين، بتشغّلهم بدبل كليك:

| الملف | امتى | بيعمل إيه |
| --- | --- | --- |
| `start.bat` | كل مرة عايز تشغّل السيستم | بيشغّل الداتابيز، وبيفتح شباك للـ API وشباك للواجهة وشباك للرابط، وبيفتح المتصفح على `http://localhost:4173` |
| `update.bat` | أول مرة، وبعد أي تحديث في الكود | بيجيب آخر كود، ويثبّت المكتبات، ويطبّق تعديلات الداتابيز، ويعمل build |

- لازم Docker Desktop يكون مفتوح قبل ما تشغّل أي واحد فيهم.
- قبل `update.bat` اقفل شبابيك HAMMER المفتوحة.
- الرابط اللي تبعته بيظهر في شباك `start.bat` نفسه في مربع واضح، وبيتنسخ لوحده (الصقه بـ Ctrl+V). `start.bat` بيدوّر على `cloudflared.exe` في فولدر المشروع، أو في الفولدر اللي فوقه، أو في الـ PATH.
- عشان توقف السيستم: اقفل شبابيك HAMMER.

### يدوي (Mac أو من غير الملفات)

افتح 3 terminals:

```bash
# 1) الـ API
cd hammer-logistics/apps/api
node dist/main.js

# 2) الواجهة
cd hammer-logistics/apps/web
npm run share                       # http://localhost:4173

# 3) الرابط
cloudflared tunnel --url http://localhost:4173
```

متشغّلش `npm audit fix` ولا `npm update`: بيحدّثوا المكتبات لنسخ مش متوافقة مع المشروع.

## ngrok بدل Cloudflare (اختياري)

لو عندك حساب ngrok: `ngrok http 4173`، والرابط بيشتغل بنفس الطريقة.

## ملاحظات

- الداتابيز على جهازك، فخلي بالك تعمل نسخة احتياطية لو فيه بيانات حقيقية:
  `docker exec -t hammer-logistics-db-1 pg_dump -U hammer hammer_logistics > backup.sql`
- مستندات الشحنات: لو `CLOUDINARY_URL` فاضي في `.env`، الملفات بتتحفظ على جهازك في فولدر `apps/api/uploads`.
  خلي بالك تاخد نسخة من الفولدر ده مع نسخة الداتابيز. ولو حطيت `CLOUDINARY_URL`، الملفات الجديدة بتترفع على Cloudinary.
