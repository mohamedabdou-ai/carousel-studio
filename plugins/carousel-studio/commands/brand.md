---
description: إعداد البراند أو تعديله · Set up or edit your brand
---

Work on the brand profile with the `brand-setup` skill. Arguments: $ARGUMENTS

- Read the arguments as words: «جديد» or `new`; «عدّل» or `edit`; «بدّل» or `switch`; «استورد», a file, or `import`.
- `new` starts the six-section setup, dialect first, at most two questions per message. Every section saves as it goes, so «كمّل الإعداد» resumes it.
- `edit` changes one section or value of the current brand; `switch` picks another brand; `import` reads a `brand.json` exported from Brand Home, or a hook bank (Markdown or CSV).
- With no argument: if a brand exists show its capsule and ask what to change; if none exists, start `new`.
- The setup ends with the Brand Book, built by `carousel-design`, for the user to approve. Skipped sections come back when they are needed.
- Digits default to Western 123; Arabic-Indic is offered only as an opt-in.

Same thing in plain words: «ابدأ» · «براند جديد» · «عدّل البراند» · «ضيف بنك الهوكات» · "set up my brand".
