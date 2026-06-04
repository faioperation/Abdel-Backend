import prisma from "../../../prisma/client.js";

const getAllPlansFromDB = async () => {
  const plans = await prisma.plans.findMany({
    orderBy: {
      monthly_price: "asc",
    },
  });
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthly_price,
    yearlyPrice: plan.yearly_price,
    stripeMonthlyPriceId: plan.stripe_monthly_price_id,
    stripeYearlyPriceId: plan.stripe_yearly_price_id,
    callLimit: plan.call_limit,
    orderLimit: plan.order_limit,
    features: plan.features,
  }));
};

const getSubscriptionDashboardDataFromDB = async () => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. Total Revenue (Paid Payments)
  const totalRevenueAggregate = await prisma.payments.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: "paid",
    },
  });

  // 2. This Month Revenue (Paid Payments)
  const monthlyRevenueAggregate = await prisma.payments.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: "paid",
      created_at: {
        gte: firstDayOfMonth,
      },
    },
  });

  // 3. Active Plans Count
  const activePlansCount = await prisma.subscriptions.count({
    where: {
      status: "active",
    },
  });

  // 4. Recent Payments (formatted as Invoices for dashboard)
  const recentPayments = await prisma.payments.findMany({
    take: 10,
    orderBy: {
      created_at: "desc",
    },
    include: {
      order: {
        include: {
          restaurant: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  // Format payments for UI
  const formattedInvoices = recentPayments.map((payment) => ({
    invoice_no: payment.stripe_payment_intent || payment.id,
    company_name: payment.order?.restaurant?.name || "N/A",
    plan: "Order Payment",
    amount: payment.amount,
    expiry_date: null,
    status: payment.status,
    billing_cycle: "one-time",
  }));

  return {
    stats: {
      total_revenue: totalRevenueAggregate._sum.amount || 0,
      monthly_revenue: monthlyRevenueAggregate._sum.amount || 0,
      active_plans: activePlansCount,
    },
    recent_invoices: formattedInvoices,
  };
};

export const SubscriptionBillingService = {
  getAllPlansFromDB,
  getSubscriptionDashboardDataFromDB,
};
