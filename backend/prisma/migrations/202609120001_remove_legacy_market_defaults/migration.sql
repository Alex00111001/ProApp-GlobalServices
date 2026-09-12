-- New market-sensitive records must receive country and currency from the
-- server-authoritative market/booking context. Existing rows are unchanged.
ALTER TABLE "ClientProfile" ALTER COLUMN "country" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "currency" DROP DEFAULT;
