const API = 'https://eventlive-pro.onrender.com/api';

const adminEmail = 'admin@maaevents9.com';
const adminPassword = 'MaaEvents9@Admin';
const targetEmail = 'balajiliveservice@gmail.com';

async function jfetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

const login = await jfetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});

if (!login.ok || !login.data?.token) {
  console.log(JSON.stringify({ step: 'login', ...login }, null, 2));
  process.exit(1);
}

const token = login.data.token;

const customers = await jfetch('/admin/customers', {
  headers: { Authorization: `Bearer ${token}` },
});

if (!customers.ok || !Array.isArray(customers.data?.data)) {
  console.log(JSON.stringify({ step: 'listCustomers', ...customers }, null, 2));
  process.exit(1);
}

const target = customers.data.data.find((u) => String(u.email).toLowerCase() === targetEmail);

if (!target) {
  console.log(JSON.stringify({ step: 'findCustomer', found: false, email: targetEmail }, null, 2));
  process.exit(2);
}

const updated = await jfetch(`/admin/customers/${target.id}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ approved: true, isActive: true }),
});

console.log(
  JSON.stringify(
    {
      step: 'updated-customer-flags',
      target: { id: target.id, email: target.email, approved: target.approved, isActive: target.isActive },
      result: updated,
      note: 'This route cannot change role; only approved/isActive flags were updated.',
    },
    null,
    2
  )
);
