# رفع السيستم أونلاين

| الجزء | فين | ليه |
| --- | --- | --- |
| قاعدة البيانات | **Neon** (PostgreSQL مجاني) | السيستم مبني على PostgreSQL، وNeon بيدي قاعدة مجانية من غير كارت |
| الـ API (NestJS) | **Render** (Web Service مجاني) | سيرفر شغال على طول، مناسب لـ Prisma ورفع الملفات |
| الواجهة (React) | **Vercel** | موقع ثابت سريع، وبيحوّل `/api` للـ API |

الكود كله في نفس الريبو، وكل جزء بيترفع لوحده. المتصفح بيكلم Vercel بس، وVercel بيحوّل `/api/*` للـ API، فالكوكي بتاع الدخول بيفضل على نفس الدومين.

> ملحوظة: الـ API على خطة Render المجانية بيقف لو مفيش طلبات لمدة 15 دقيقة، وأول طلب بعدها بياخد حوالي دقيقة.
> للاستخدام الفعلي في المكتب استخدموا خطة مدفوعة (Starter) علشان يفضل شغال.

## 1) قاعدة البيانات على Neon

1. اعمل حساب على neon.tech، وبعدين **Create project** (المنطقة: Frankfurt علشان تبقى قريبة من مصر).
2. من **Connection details** انسخ الـ connection string، واختار النوع **Direct** مش Pooled.
   شكله كده: `postgresql://USER:PASSWORD@HOST/neondb?sslmode=require`
3. احتفظ بيه، هتحتاجه في خطوة 2 وخطوة 4.

## 2) الـ API على Render

1. اعمل حساب على render.com واربطه بـ GitHub.
2. **New → Blueprint**، واختار ريبو `hammer-logistics`. Render هيقرا ملف `render.yaml` ويعمل خدمة اسمها `hammer-logistics-api`.
3. هيطلب منك القيم دي:
   - `DATABASE_URL`: الـ connection string من Neon.
   - `WEB_ORIGIN`: رابط Vercel (هتعرفه في خطوة 3، ممكن تحطه بعدين وتعمل Redeploy).
   - `CLOUDINARY_URL`: من cloudinary.com، علشان رفع المستندات. **مهم أونلاين:** من غيره الملفات بتتحفظ على سيرفر Render نفسه، وبتضيع مع كل deploy.
   - `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET` بيتعملوا تلقائي.
4. بعد ما الـ deploy يخلص، افتح `https://hammer-logistics-api.onrender.com/api/health`، المفروض يرجّع `{"status":"ok"}`.
   لو Render إدّى الخدمة اسم تاني، عدّل الرابط في `apps/web/vercel.json`.

الجداول بتتعمل تلقائي مع كل تشغيل (`prisma migrate deploy`).

## 3) الواجهة على Vercel

1. vercel.com، وبعدين **Add New → Project**، واختار نفس الريبو.
2. **Root Directory**: `apps/web`. باقي الإعدادات بتتقري من `apps/web/vercel.json`.
3. **Deploy**. هتاخد رابط زي `https://hammer-logistics.vercel.app`.
4. ارجع لـ Render وحط الرابط ده في `WEB_ORIGIN`.

## 4) أول تشغيل: الأدوار والـ CEO

ده بيتعمل مرة واحدة بس، من جهازك، على قاعدة Neon:

```bash
cd apps/api
npm install
DATABASE_URL="<connection string من Neon>" \
SEED_CEO_EMAIL="ceo@hammerline.com" \
SEED_CEO_PASSWORD="<كلمة سر قوية>" \
SEED_CEO_NAME="المدير التنفيذي" \
npx prisma db seed
```

الأمر ده بيعمل الأدوار والخزنتين والقوائم الثابتة (الموانئ والدول وغيرها) وحساب الـ CEO.
افتح رابط Vercel وادخل بالحساب ده.

بعد كده:
- **الـ CEO أو الـ HR:** يضيفوا الموظفين والمستخدمين، ويكتبوا إيميلات الشركة من "إعدادات الشركة".
- **الـ CEO:** يضيف الحسابات البنكية.

## تحديثات بعد كده

أي `git push` على `main` بيعمل deploy تلقائي على Render وعلى Vercel. ولو فيه تعديل في الداتابيز، بيتطبق لوحده مع تشغيل الـ API.

## الأمان

- متحطش أي كلمة سر أو مفتاح في الكود ولا في الشات. القيم دي بتتكتب في إعدادات Render وNeon بس.
- اختار كلمة سر قوية للـ CEO في أمر الـ seed. شاشة يغيّر فيها المستخدم كلمة السر بتاعته لسه مش موجودة في الواجهة، والـ API بتاعها جاهز.
