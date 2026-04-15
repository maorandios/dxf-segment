"use client";

import { BlockTitle, List, ListItem } from "konsta/react";

export default function OmegaSettingsPlaceholderPage() {
  return (
    <div dir="rtl">
      <BlockTitle large>הגדרות</BlockTitle>

      <List strong inset>
        <ListItem title="הגדרות חשבון" link />
        <ListItem title="התראות" link />
        <ListItem title="שפה" link />
        <ListItem title="אודות" link />
      </List>
    </div>
  );
}
