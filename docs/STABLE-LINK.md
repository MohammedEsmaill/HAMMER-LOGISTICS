# رابط ثابت على دومين الشركة

رابط زي `https://app.hammerline.com` ما بيتغيرش. الموظفين بيفتحوه من أي مكان ويدخلوا بإيميلاتهم.
السيرفر والداتابيز والمستندات بيفضلوا على جهازك، وCloudflare Tunnel المجاني هو اللي بيوصل الرابط بجهازك.

> الرابط شغال طول ما جهازك مفتوح وشبابيك HAMMER شغالة. خلّي الجهاز ما ينامش: من Windows، **Power & sleep**، وخلّي **Sleep** على **Never**. و`autostart-install.bat` بيخلي السيستم يشتغل لوحده مع Windows.

## مرة واحدة: الدومين على Cloudflare

1. اعمل حساب مجاني على [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. اختار **Add a domain**، واكتب `hammerline.com`، واختار الخطة **Free**.
3. Cloudflare هيعرض سجلات الـ DNS اللي لقاها. **راجعها كويس قبل ما تكمل**، خصوصاً سجلات الإيميل:
   - كل سجلات **MX**.
   - سجلات **TXT** (زي `v=spf1` و DKIM و `google-site-verification`).

   قارنها بالقايمة اللي عند الموقع اللي اشتريت منه الدومين، وضيف أي سجل ناقص. لو سجل ناقص، الإيميلات ممكن تقف.
4. Cloudflare هيديك اسمين **Nameservers**. ادخل حساب الموقع اللي اشتريت منه الدومين (GoDaddy أو Namecheap أو غيرهم)، وغيّر الـ Nameservers للاسمين دول.
5. استنى إيميل من Cloudflare إن الدومين بقى **Active**. ممكن ياخد من دقايق لحد 24 ساعة.

## مرة واحدة: الـ Tunnel

1. لو `cloudflared.exe` مش موجود جنب `start.bat`، نزّله لويندوز من [صفحة cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) وحطه جنبه.
2. من لوحة Cloudflare افتح **Zero Trust**. أول مرة هيطلب اسم للفريق واختيار الخطة **Free**.
3. **Networks**، بعدين **Tunnels**، بعدين **Create a tunnel**، واختار **Cloudflared**، وسمّيه `hammer`.
4. في صفحة التثبيت هتلاقي أمر فيه `--token` وبعده كلام طويل. **ما تشغّلش الأمر.** خد الكلام الطويل اللي بعد `--token` بس، واحفظه في ملف اسمه `cloudflare-token.txt` جنب `start.bat`.
   الـ token ده سري: ما تبعتهوش لحد ولا في الشات، والملف مش بيترفع على GitHub.
5. كمّل لحد **Public Hostname** واملا:
   - **Subdomain**: `app`
   - **Domain**: `hammerline.com`
   - **Service Type**: `HTTP`
   - **URL**: `localhost:4173`

   وبعدين **Save**.
6. اعمل ملف اسمه `public-url.txt` جنب `start.bat`، واكتب فيه `app.hammerline.com` في سطر واحد بس.

## في `apps/api/.env`

```
TRUST_PROXY_HOPS=1      # علشان حماية الدخول تشوف جهاز كل مستخدم مش جهازك
```

## كل يوم

شغّل `start.bat`، أو خليه يشتغل لوحده مع Windows. لما يلاقي `cloudflare-token.txt` بيفتح الرابط الثابت ويكتبه في الشباك.
الموظفين بيفتحوا `https://app.hammerline.com` ويدخلوا بإيميلاتهم وكلمات سرهم.

لو الملف مش موجود، `start.bat` بيرجع للرابط المؤقت اللي بيتغير كل مرة (`docs/SHARE.md`).
