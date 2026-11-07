import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';

export function ForbiddenPage() {
  return (
    <div className="card mx-auto grid max-w-lg place-items-center gap-3 p-10 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-danger/10 text-danger">
        <ShieldX className="size-8" />
      </span>
      <h2 className="text-xl font-bold">ليس لديك صلاحية</h2>
      <p className="text-muted">
        الصفحة دي مش ضمن صلاحيات دورك. لو محتاجها، كلم الـ CEO يضيفها لدورك.
      </p>
      <Link to="/" className="mt-2 font-semibold text-gold hover:underline">
        الرجوع للرئيسية
      </Link>
    </div>
  );
}
