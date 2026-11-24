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
