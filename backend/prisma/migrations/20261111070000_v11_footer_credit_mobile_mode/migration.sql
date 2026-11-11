-- Mobile placement for the platform footer credit (FLOATING = current, STATIC = in-flow).
CREATE TYPE "FooterCreditMobileMode" AS ENUM ('FLOATING', 'STATIC');

ALTER TABLE "PlatformSettings"
  ADD COLUMN "footerCreditMobileMode" "FooterCreditMobileMode" NOT NULL DEFAULT 'FLOATING';
