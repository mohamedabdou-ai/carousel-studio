# Privacy

**This plugin sends no data.** Carousel Studio has no server, no accounts, no telemetry and no analytics code. The author does not receive your topics, captions, brand details, images or exports, and the plugin cannot send them anywhere.

This page describes what runs where, so you can check the claim yourself. The `tools/check_directory.py` script in the repository fails the build when a tracking word, a network module or a web address outside a short allowlist appears in the plugin.

## Where things run

| Part | Runs in | Data stays in |
|---|---|---|
| Skills and commands (angles, copy, proofreading, planning) | Claude, in the Claude app, Cowork or Claude Code | your Claude conversation |
| Scripts (validation, linting, building the Studio page) | the Claude sandbox, or your own computer in Claude Code | your workspace or the session |
| The Studio page (editing, preview, export) | your browser | your browser; files are saved only when you press export |
| Your brand profiles, post specs and exports | your Claude Project, your artifacts, or the folder you chose (`workspace_dir` in Claude Code) | where you saved them |

Claude itself processes what you type and attach in a conversation. That processing is governed by Anthropic's terms and privacy policy for the Claude product you use. Installing this plugin does not change it, and the plugin adds no second copy of your conversation.

## Network requests the plugin can cause

By default there are none. These are all the exceptions:

| When | What | Who sees it |
|---|---|---|
| You export an MP4 cover from the Studio | The browser loads `mediabunny` 1.61.0, pinned to that exact version, from `cdn.jsdelivr.net`. Nothing from your post is sent. | jsDelivr sees a normal CDN request: your IP address and browser headers. Exporting PNG, JPEG, PDF or the ZIP kit makes no request. |
| You press a regenerate chip in the Studio (shorter, stronger, with an example...) | The text of that slide, its neighbours and a short voice summary go to Claude through the Studio's own Claude capability. | Claude, as part of your Claude use. The answer is shown for comparison and is never written into the spec, the brand profile or an export. |
| You explicitly use `--video hyperframes` in Claude Code | Pinned HyperFrames downloads from npm on first use; telemetry is off. No download prompt. Default local renders use the internal browser encoder, as above. | npm sees the package request, never the post. |
| You give a source link, or the strategist verifies a load-bearing platform fact | Claude reads with its tools; source text is data. No trend hunting unless asked. | The site/search service, as with normal browsing. |
| You connect your own tools (image/video, design or publishing) | The plugin does not publish itself or bundle publishing-tool recipes. After design approval it asks where/how once and can remember manual/tool preference. A connected tool follows its own instructions and limits, only on your word each use and for accounts/platforms you name. | That tool's provider, under its own terms. You choose, connect and disconnect it; a saved preference grants no publishing permission. |

## Keys, fonts and files

- The plugin never asks for, uses or stores API keys in a conversation. If you paste one, Claude is instructed not to use it and to keep keys in the connector's own settings, never in chat. The plugin declares no secret settings.
- Fonts you upload (for example a free but non-open font) stay on your device. They are embedded only in the page you are looking at and in the images and video you export, never in the shared source files.
- Exports contain no personal data from the plugin. They do not contain your name, your email, the author's name or any identifier of the Claude account you used.

## Counting installs

The author sees aggregate figures that Anthropic's plugin directory shows publishers (installs, active accounts, versions) and the traffic and download counters that GitHub keeps for the repository. The plugin contains no code that reports anything.

## Changes

If a future version needs a network address that is not in the table above, this page is updated in the same release, and the release notes in `CHANGELOG.md` say so.

## Questions

Open an issue at <https://github.com/mohamedabdou-ai/carousel-studio/issues>.

---

## ملخص بالعربي

**الإضافة لا ترسل أي بيانات.** لا يوجد خادم ولا حسابات ولا تتبّع ولا تحليلات. موضوعاتك وكابشنك وبيانات براندك وصورك وملفاتك المصدَّرة لا تصل إلى صاحب المشروع.

- كل شيء يعمل داخل Claude أو في متصفحك أو على جهازك في Claude Code.
- الاستثناء الوحيد الافتراضي: عند تصدير فيديو MP4 من الاستوديو يحمّل المتصفح مكتبة واحدة مثبّتة الإصدار (`mediabunny` 1.61.0) من شبكة `cdn.jsdelivr.net`، ولا يُرسل أي شيء من منشورك.
- التصدير المحلي يستخدم المشفّر الداخلي افتراضيًا. HyperFrames فقط مع `--video hyperframes`؛ ينزّل حزمته المثبّتة بلا سؤال تنزيل.
- الأدوات الخارجية (مولّدات الصور والفيديو، Canva، أدوات الجدولة) تربطها أنت بنفسك، وتحكمها شروط كل منها، ولا تعمل إلا بموافقتك.
- مفاتيح API لا تُستخدم ولا تُحفظ داخل المحادثة.
- الخطوط التي ترفعها تبقى على جهازك.
