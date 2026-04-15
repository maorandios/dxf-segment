"use client";

import { BlockTitle, Block, List, ListItem } from "konsta/react";

export default function OmegaRequestsPlaceholderPage() {
  return (
    <div dir="rtl">
      <BlockTitle large>בקשות</BlockTitle>

      <Block strong inset>
        <p className="opacity-70">אין בקשות פעילות כרגע.</p>
      </Block>

      <List strong inset>
        <ListItem title="בקשה לדוגמה #1" after="ממתין" link />
        <ListItem title="בקשה לדוגמה #2" after="הושלם" link />
        <ListItem title="בקשה לדוגמה #3" after="ממתין" link />
      </List>
    </div>
  );
}
