import axios, { AxiosError, type AxiosAdapter } from 'axios';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'synthetic-session'),
}));

const transport = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>();
let apiClient: typeof import('./api').apiClient;

beforeAll(() => {
  const create = axios.create.bind(axios);
  const spy = jest.spyOn(axios, 'create').mockImplementation((config) =>
    create({ ...config, adapter: transport }),
  );
  try {
    ({ apiClient } = require('./api'));
  } finally {
    spy.mockRestore();
  }
});

beforeEach(() => transport.mockReset());

const request = {
  professionalId: 'fixture-pro',
  services: [{ serviceId: 'fixture-service', quantity: 1 }],
  scheduledDate: '2027-01-15T00:00:00',
  scheduledTime: '14:30',
  address: 'Fixture address',
  city: 'Fixture city',
  state: 'Fixture region',
  zipCode: '00000',
};
const key = 'synthetic-booking-attempt';

test('sends the booking wire payload and returns the created booking', async () => {
  const booking = { id: 'fixture-booking', status: 'PENDING' };
  transport.mockImplementationOnce(async (config) => ({
    config, data: { booking }, headers: {}, status: 201, statusText: 'Created',
  }));

  await expect(apiClient.createBooking(request, key)).resolves.toEqual(booking);
  expect(transport).toHaveBeenCalledTimes(1);
  const [config] = transport.mock.calls[0];
  expect(config.method).toBe('post');
  expect(config.url).toBe('/bookings');
  expect(config.headers.get('Authorization')).toBe('Bearer synthetic-session');
  expect(config.headers.get('Idempotency-Key')).toBe(key);
  expect(JSON.parse(config.data)).toEqual({
    professionalId: request.professionalId,
    services: request.services,
    scheduledDate: new Date(2027, 0, 15, 14, 30).toISOString(),
    address: request.address,
    city: request.city,
    state: request.state,
    postalCode: request.zipCode,
  });
});

test('surfaces a booking conflict to the caller without retrying', async () => {
  const error = 'Booking slot is unavailable';
  transport.mockImplementationOnce(async (config) => {
    throw new AxiosError(error, AxiosError.ERR_BAD_REQUEST, config, undefined, {
      config, data: { error }, headers: {}, status: 409, statusText: 'Conflict',
    });
  });

  await expect(apiClient.createBooking(request, key)).rejects.toThrow(error);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('requests a payment intent and returns the payment sheet details', async () => {
  const bookingId = '00000000-0000-4000-8000-000000000001';
  const paymentIntent = {
    success: true,
    clientSecret: 'fixture-client-secret',
    paymentIntentId: 'pi_fixture123',
    amount: 12500,
    currency: 'EUR',
  };
  transport.mockImplementationOnce(async (config) => ({
    config, data: paymentIntent, headers: {}, status: 200, statusText: 'OK',
  }));

  await expect(apiClient.createPaymentIntent(bookingId)).resolves.toEqual(paymentIntent);
  expect(transport).toHaveBeenCalledTimes(1);
  const [config] = transport.mock.calls[0];
  expect(config.method).toBe('post');
  expect(config.url).toBe('/payments/create-intent');
  expect(config.headers.get('Authorization')).toBe('Bearer synthetic-session');
  expect(JSON.parse(config.data)).toEqual({ bookingId });
});

test('sends payment confirmation and returns the booking and payment states', async () => {
  const bookingId = '00000000-0000-4000-8000-000000000001';
  const paymentIntentId = 'pi_fixture123';
  const date = '2027-01-15T12:00:00.000Z';
  const payment = {
    id: '00000000-0000-4000-8000-000000000002', bookingId,
    amount: '125.00', currency: 'EUR', status: 'COMPLETED', method: 'STRIPE',
    processedAt: date, refundedAt: null, refundAmount: null, createdAt: date, updatedAt: date,
  };
  const booking = {
    id: bookingId, professionalId: '00000000-0000-4000-8000-000000000003',
    status: 'PENDING', scheduledDate: date, endDate: date,
    address: 'Fixture address', city: 'Fixture city', state: 'Fixture region', postalCode: '00000', notes: null,
    totalPrice: '125.00', serviceAmount: '100.00', platformFee: '25.00', professionalEarnings: '100.00',
    currency: 'EUR', cancelledBy: null, cancellationReason: null, cancelledAt: null, completedAt: null,
    createdAt: date, updatedAt: date,
    professional: {
      id: '00000000-0000-4000-8000-000000000003',
      user: { id: '00000000-0000-4000-8000-000000000004', firstName: 'Test', lastName: 'Professional', avatarUrl: null },
    },
    bookingServices: [{
      id: '00000000-0000-4000-8000-000000000005',
      serviceId: '00000000-0000-4000-8000-000000000006', quantity: 1, price: '100.00', subtotal: '100.00',
      service: { id: '00000000-0000-4000-8000-000000000006', name: 'Test service' },
    }],
    payment,
  };
  const confirmation = { success: true, payment, booking, duplicate: false, message: 'Pago confirmado exitosamente' };
  transport.mockImplementationOnce(async (config) => ({
    config, data: confirmation, headers: {}, status: 200, statusText: 'OK',
  }));

  await expect(apiClient.confirmPayment(bookingId, paymentIntentId)).resolves.toEqual(confirmation);
  expect(transport).toHaveBeenCalledTimes(1);
  const [config] = transport.mock.calls[0];
  expect(config.method).toBe('post');
  expect(config.url).toBe('/payments/confirm');
  expect(config.headers.get('Authorization')).toBe('Bearer synthetic-session');
  expect(JSON.parse(config.data)).toEqual({ bookingId, paymentIntentId });
});

test('surfaces a payment confirmation conflict without retrying', async () => {
  const message = 'El pago ya fue reembolsado';
  transport.mockImplementationOnce(async (config) => {
    throw new AxiosError('Request failed with status code 409', AxiosError.ERR_BAD_REQUEST, config, undefined, {
      config, data: { success: false, message }, headers: {}, status: 409, statusText: 'Conflict',
    });
  });

  await expect(apiClient.confirmPayment('00000000-0000-4000-8000-000000000001', 'pi_fixture123'))
    .rejects.toThrow(message);
  expect(transport).toHaveBeenCalledTimes(1);
});
