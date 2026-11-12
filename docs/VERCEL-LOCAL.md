# الواجهة على Vercel والسيرفر على جهازك

الواجهة بتترفع على Vercel برابط ثابت. الـ API والداتابيز والمستندات بيفضلوا على جهازك، وVercel بيوصلهم من خلال رابط **ngrok** ثابت.

> السيستم بيشتغل طول ما جهازك مفتوح وشبابيك HAMMER شغالة. لو الجهاز اتقفل أو نام، الواجهة هتفتح بس من غير بيانات.

## مرة واحدة: ngrok

1. اعمل حساب مجاني على ngrok.com.
2. من **Your Authtoken** انسخ الـ token، وشغّل في PowerShell (من فولدر المشروع):
   ```powershell
   .\ngrok.exe config add-authtoken <الـ token>
   ```
   الـ token سري: متبعتهوش لحد ولا في الشات.
3. نزّل `ngrok.exe` لويندوز من ngrok.com/download، وحطه جنب `start.bat`.
4. من **Domains** في حساب ngrok، خد الدومين الثابت المجاني (زي `hammer-line.ngrok-free.app`).
5. اعمل ملف اسمه `ngrok-domain.txt` جنب `start.bat`، واكتب فيه الدومين بس في سطر واحد.

## مرة واحدة: Vercel

1. vercel.com، وبعدين **Add New → Project**، واختار ريبو `hammer-logistics`.
2. **Root Directory**: `apps/web`. باقي الإعدادات من `apps/web/vercel.json`.
3. في `apps/web/vercel.json` لازم رابط `/api` يكون الدومين بتاعك (`https://<الدومين>/api/:path*`).
4. **Deploy**. هتاخد رابط زي `https://hammer-logistics.vercel.app`.

## في `apps/api/.env`

```
TRUST_PROXY_HOPS=2      # الطلب بيعدّي على Vercel ثم ngrok: علشان حماية الدخول تشوف جهاز المستخدم
```

## كل يوم

شغّل `start.bat`: بيشغّل الداتابيز والـ API والواجهة، وبيفتح رابط ngrok للـ API. وافتح رابط Vercel من أي جهاز.
