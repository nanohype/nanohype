import { getProvider, type PaymentProvider, registerProvider } from "../providers/index.js";

/**
 * A provider that charges through `inner` and hands each charge's result to
 * `audit`. It carries every method a PaymentProvider has; one for another
 * gateway fills each with calls to that gateway's API.
 */
function createAuditedProvider(
  inner: PaymentProvider,
  audit: (entry: Record<string, unknown>) => void,
): PaymentProvider {
  return {
    name: `audited-${inner.name}`,
    init: (config) => inner.init(config),
    createCustomer: (email, name, metadata) => inner.createCustomer(email, name, metadata),
    createSubscription: (customerId, planId) => inner.createSubscription(customerId, planId),
    async chargeInvoice(invoice, options) {
      const result = await inner.chargeInvoice(invoice, options);
      audit({ invoiceId: invoice.id, ...result });
      return result;
    },
    handleWebhook: (payload, signature) => inner.handleWebhook(payload, signature),
    listInvoices: (customerId) => inner.listInvoices(customerId),
    close: () => inner.close(),
  };
}

registerProvider("audited-stripe", () =>
  createAuditedProvider(getProvider("stripe"), (entry) => console.log(JSON.stringify(entry))),
);
