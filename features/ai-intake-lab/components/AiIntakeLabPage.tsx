"use client";

import { FlaskConical } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { SimulatedEmailForm } from "./SimulatedEmailForm";

export function AiIntakeLabPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader
          titleIcon={FlaskConical}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {t("aiIntake.title")}
              <Badge variant="secondary" className="rounded-md font-normal">
                {t("aiIntake.labBadge")}
              </Badge>
            </span>
          }
          description={t("aiIntake.subtitle")}
        />
        <SimulatedEmailForm />
      </div>
    </PageContainer>
  );
}
