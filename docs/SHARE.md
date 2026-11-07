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
npm install
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

## كل مرة: التشغيل والمشاركة

افتح 3 terminals:

```bash
# 1) الـ API
cd hammer-logistics/apps/api
node dist/main.js

# 2) الواجهة (نسخة الإنتاج، أسرع من وضع التطوير)
cd hammer-logistics/apps/web
npm run share                       # http://localhost:4173

# 3) الرابط
cloudflared tunnel --url http://localhost:4173
```

الـ terminal التالت هيطبع رابط زي `https://blue-river-1234.trycloudflare.com`. ابعته، وادخل بحساب الـ CEO.

بعد أي تحديث في الكود: اعمل `git pull`، و`npx prisma migrate deploy` و`npm run build` في `apps/api`، وبعدين شغّل تاني.

## ngrok بدل Cloudflare (اختياري)

لو عندك حساب ngrok: `ngrok http 4173`، والرابط بيشتغل بنفس الطريقة.

## ملاحظات

- الداتابيز على جهازك، فخلي بالك تعمل نسخة احتياطية لو فيه بيانات حقيقية:
  `docker exec -t hammer-logistics-db-1 pg_dump -U hammer hammer_logistics > backup.sql`
- رفع المستندات محتاج `CLOUDINARY_URL` في `.env`. من غيره كل حاجة تانية شغالة.
