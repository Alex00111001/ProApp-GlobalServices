// Only use with fixture-scoped predicates on an explicitly isolated test DB.
// The F8 database trigger creates a durable delivery row on outbox insertion.
// Delete that dependent row before the source event; retain production FK rules.
const deleteFixtureOutbox = async (prisma, where) => {
  await prisma.automationEventDelivery.deleteMany({ where: { sourceEvent: where } });
  await prisma.outboxEvent.deleteMany({ where });
};

module.exports = { deleteFixtureOutbox };
