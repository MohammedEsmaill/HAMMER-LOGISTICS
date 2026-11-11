import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, LogIn, Mail, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/lib/use-theme';
import { loginSchema, type LoginForm } from './login-schema';

const GoldScene = lazy(() => import('@/components/three/GoldScene'));

const STEPS = [
  { title: 'تسجيل الشحنات', text: 'وارد بحري وجوي ومناطق حرة، وصادر' },
  { title: 'متابعة المراحل', text: 'من التبليغ لحد الصرف، خطوة بخطوة' },
  { title: 'النافذة والمستندات', text: 'كل بيانات الجمارك وملفات الشحنة في مكان واحد' },
];

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const [serverError, setServerError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), mode: 'onTouched' });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      const profile = await login(email, password);
      toast.success(`أهلًا ${profile.name}`);
    } catch (error) {
      setServerError(error);
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* brand stage: always dark */}
      <section className="relative hidden overflow-hidden bg-[#0b0b0d] lg:block">
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <GoldScene mode="calm" />
          </div>
        </Suspense>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0b0d] via-transparent to-[#0b0b0d]/60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <motion.img
            src="/logo-full.png"
            alt="HAMMER LINE Shipping & Logistics"
            className="w-72"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          />
          <div className="space-y-5">
            <motion.h2
              className="text-4xl leading-snug font-bold text-[#f2efe7]"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
            >
              كل شحنة، <span className="gold-text">من الميناء لباب العميل</span>
            </motion.h2>
            <ul className="space-y-3">
              {STEPS.map((step, i) => (
                <motion.li
                  key={step.title}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + i * 0.15, duration: 0.6 }}
                >
                  <span className="mt-1.5 size-2.5 shrink-0 rotate-45 bg-[#d4a73c]" />
                  <span>
                    <span className="block font-semibold text-[#f2efe7]">{step.title}</span>
                    <span className="text-sm text-[#9b968a]">{step.text}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* form */}
      <section className="relative flex items-center justify-center p-6 sm:p-10">
        <button
          type="button"
          onClick={toggle}
          className="focus-ring absolute top-5 left-5 rounded-xl border border-line bg-surface p-2.5 text-muted hover:text-gold"
          aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>

        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <img src="/logo-mark.png" alt="" className="mb-6 w-16 lg:hidden" />
          <h1 className="text-3xl font-bold">تسجيل الدخول</h1>
          <p className="mt-2 text-muted">ادخل بإيميل الشركة وكلمة السر.</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            <TextField
              label="الإيميل"
              type="email"
              dir="ltr"
              autoComplete="username"
              placeholder="name@hammerline.com"
              icon={<Mail className="size-4" />}
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="كلمة السر"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              icon={<Lock className="size-4" />}
              error={errors.password?.message}
              {...register('password')}
            />
            {serverError ? <ErrorBox error={serverError} /> : null}
            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              icon={<LogIn className="size-4 -scale-x-100" />}
            >
              دخول
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-muted" dir="ltr">
            © {new Date().getFullYear()} HAMMER LINE Shipping &amp; Logistics
          </p>
        </motion.div>
      </section>
    </div>
  );
}
