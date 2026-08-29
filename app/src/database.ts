import { EMPLOYEES, ORDERS, PAYMENTS, ROLES, type Employee, type Order, type Payment, type Role } from "./data";

/**
 * The database the personas act on. In memory, in your browser, nowhere else.
 *
 * It exists so a refusal has something to protect. A verdict badge is a
 * claim; a row that did not change is evidence. Every mutation is reachable
 * only through `applyApprovedAction`, which the app calls solely after the
 * gate returned APPROVE.
 *
 * Drop it whenever you like — `seed()` returns you to a known state.
 */
export interface Database {
  roles: Role[];
  employees: Employee[];
  payments: Payment[];
  orders: Order[];
  changelog: string[];
}

export function seed(): Database {
  // Deep-ish copies: the seeds are module-level and readonly, and a mutation
  // reaching them would survive a reset and corrupt every later run.
  return {
    roles: ROLES.map((r) => ({ ...r })),
    employees: EMPLOYEES.map((e) => ({ ...e })),
    payments: PAYMENTS.map((p) => ({ ...p })),
    orders: ORDERS.map((o) => ({ ...o })),
    changelog: [],
  };
}

const PROMOTION_LADDER: Record<string, string> = {
  "Support Engineer": "Senior Engineer",
  "Senior Engineer": "Engineering Manager",
};

/**
 * Apply the state change an APPROVED action earns.
 *
 * Named for its precondition. There is no `applyAction`, so no caller can
 * reach a mutation without saying out loud that the gate allowed it.
 *
 * Personas that act elsewhere — IT Ops on your filesystem and network, Agent
 * Ops on a branch — return the database untouched. A changelog line for
 * something that did not happen here would be a lie about what the app did.
 */
export function applyApprovedAction(
  database: Database,
  input: { personaId: string; actionId: string; parameters: Record<string, number> },
): Database {
  const next: Database = {
    roles: database.roles.map((r) => ({ ...r })),
    employees: database.employees.map((e) => ({ ...e })),
    payments: database.payments.map((p) => ({ ...p })),
    orders: database.orders.map((o) => ({ ...o })),
    changelog: [...database.changelog],
  };
  const note = (message: string) => next.changelog.unshift(message);

  switch (`${input.personaId}:${input.actionId}`) {
    case "hr:promotion_clean": {
      const employee = next.employees.find((e) => e.pay_equity_cleared);
      const to = employee ? PROMOTION_LADDER[employee.role_title] : undefined;
      if (!employee || !to) return database;
      const from = employee.role_title;
      employee.role_title = to;
      note(`EMP ${employee.rid}: ${from} → ${to}`);
      return next;
    }
    case "hr:salary_pay_equity_cleared": {
      // The schema puts salary on the ROLE, so a pay change moves the band.
      const role = next.roles.find((r) => r.title === "Senior Engineer");
      if (!role) return database;
      const from = role.salary;
      role.salary = Math.round(role.salary * 1.08);
      note(`ROLES "${role.title}": ${from.toLocaleString()} → ${role.salary.toLocaleString()}`);
      return next;
    }
    case "fintech:payment_clean": {
      const payment = next.payments.find((p) => p.status === "pending" && p.duplicate_of === null);
      if (!payment) return database;
      payment.status = "processed";
      note(`PAYMENTS ${payment.eid}: pending → processed (nothing left this browser)`);
      return next;
    }
    case "commerce:apply_discount": {
      const order = next.orders.find((o) => o.status === "open");
      if (!order) return database;
      const from = order.discount_percent;
      order.discount_percent = input.parameters.discount_percent ?? from;
      note(`ORDERS ${order.order_id}: discount ${from}% → ${order.discount_percent}%`);
      return next;
    }
    case "commerce:checkout": {
      const order = next.orders.find((o) => o.status === "open");
      if (!order) return database;
      order.status = "checked_out";
      note(`ORDERS ${order.order_id}: open → checked_out`);
      return next;
    }
    default:
      return database;
  }
}
