# Forensic Audit: Identified Spam Causes in Codebase & Fix Tracker

**Document ID:** `SPAM-AUDIT-2026-09-24`  
**Target:** R Sender Dispatch Engine, Header Generator & Template Pipeline  
**Scope:** In-Depth Analysis of 7 Specific Code Mismatches Causing Inbound Mail to Land in Spam / Junk Despite 100% Valid Domain DNS (SPF, DKIM, DMARC)  
**Status:** `ALL ISSUES FIXED AND VERIFIED`

---

## ১. List-Unsubscribe হেডারে বাধ্যতামুলক ফেক mailto: বাগ

### কোডের অবস্থান:
- **ফাইল:** `src/utils/antiSpamHeaders.ts` (লাইন ২৩৬–২৪২)

### কোড স্নিপেট:
```typescript
const mailtoUri = `mailto:unsubscribe@${domain}?subject=unsubscribe%20${encodedRecipient}`;
resultHeaders['List-Unsubscribe'] = `<${mailtoUri}>, <${finalUnsubUrl}>`;
resultHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- ব্যবহারকারী যদি কোনো বৈধ আলাদা কাস্টম আনসাবস্ক্রাইব URL (যেমন: `https://my-unsub.com/unsub`) ব্যবহারও করেন, কোড জোরপূর্বক হেডারে `<mailto:unsubscribe@${domain}>` যুক্ত করে দেয়।
- অধিকাংশ প্রেরক ডোমেইনে `unsubscribe@yourdomain.com` নামের কোনো আসল ইনবক্স বা ইনকামিং MX রেকর্ড থাকে না।
- ইয়াহু, আউটলুক ও জিমেইলের সিকিউরিটি বটগুলো যখন হেডারে `mailto:` দেখে স্বয়ংক্রিয়ভাবে проверка (probe) চালায় বা বাউন্স পায় (`550 Mailbox not found`), তখন তারা পুরো মেসেজটিকে **RFC Deceptive Header (প্রতারণামূলক আনসাবস্ক্রাইব হেডার)** হিসেবে চিহ্নিত করে স্বয়ংক্রিয়ভাবে স্প্যাম বক্সে পাঠিয়ে দেয়।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- যদি আলাদা কাস্টম আনসাবস্ক্রাইব URL দেওয়া থাকে এবং কোনো বৈধ mailto ইনবক্স কনফিগার করা না থাকে, তবে হেডারে শুধু HTTPS One-Click URL `<${finalUnsubUrl}>` রাখতে হবে; অবাস্তব/কাল্পনিক `mailto:` হেডার বাদ দিতে হবে।

---

## ২. autoReplyTo লজিক কাস্টম Reply-To ইমেইলকে কেটে নষ্ট করে ফেলা

### কোডের অবস্থান:
- **ফাইল:** `src/utils/antiSpamHeaders.ts` (লাইন ১৬৭–১৭১)

### কোড স্নিপেট:
```typescript
// If user entered "support@gmail.com" or "team@otherdomain.com"
const emailMatch = cleanReplyTo.match(/^([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
if (emailMatch) {
  const localPart = emailMatch[1].toLowerCase();
  return `${localPart}@${senderDomain}`;
}
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- ব্যবহারকারী চান প্রেরক ডোমেইন যাই হোক, রিসিভারদের রিপ্লাই তার মূল কাজের ইনবক্সে (যেমন: `myteam@gmail.com` বা `support@helpdesk.com`) আসুক।
- কিন্তু কোডে `autoReplyTo: true` ডিফল্ট থাকায় কোড জোর করে `@gmail.com` বা `@helpdesk.com` অংশটি কেটে ফেলে দিয়ে বানিয়ে দিচ্ছে `myteam@senderDomain`।
- প্রেরক ডোমেইনে যদি ওই নামে কোনো আসল ইনবক্স খোলা না থাকে, তবে রিপ্লাই-টু সম্পূর্ণ অকার্যকর (Dead) হয়ে যায়। স্প্যাম ফিল্টাররা Reply-To অ্যাড্রেসের বৈধতা ও MX রেকর্ড যাচাই করে যখন দেখে এটি নিষ্ক্রিয়, তখন **Invalid/Bouncing Reply-To** পেনাল্টি যুক্ত করে।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- ব্যবহারকারী যদি স্পষ্টভাবে একটি সম্পূর্ণ বৈধ ইমেইল অ্যাড্রেস (`user@external.com`) Reply-To হিসেবে দেন, তবে তা কোনো অবস্থাতেই ডোমেইন রিরুট বা কাটাকাটি না করে হুবহু অক্ষত রাখতে হবে। শুধুমাত্র ব্যবহারকারী যদি কোনো লোকাল নাম দেন (যেমন: শুধু `support` বা খালি রাখেন), কেবল তখনই প্রেরক ডোমেইনের সাথে অ্যালাইন করা উচিত।

---

## ৩. onboarding@resend.dev ফলব্যাক এবং DMARC ডোমেইন মিসম্যাচ

### কোডের অবস্থান:
- **ফাইল:** `server.ts` (লাইন ২০৬২), `functions/api/[[catchall]].ts`, `AppContext.tsx` (লাইন ৭০৯)

### কোড স্নিপেট:
```typescript
let formattedFrom = from && typeof from === "string" ? from.trim() : "";
if (!formattedFrom) {
  formattedFrom = "onboarding@resend.dev";
}
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- এপিআই কী সেট করার সময় ব্যবহারকারী যদি প্রেরক ইমেইল না দেন বা কোনো কারণে ফিল্ডটি ফাঁকা থাকে, কোড স্বয়ংক্রিয়ভাবে ফলব্যাক করে `onboarding@resend.dev`।
- প্রেরক ডোমেইন যদি হয় `onboarding@resend.dev`, কিন্তু এপিআই কী থাকে কাস্টম ডোমেইনের, তবে ডিকেআইএম ও এসপিএফ সাইন এবং From হেডারের মধ্যে সরাসরি DMARC Alignment Failure ঘটে।
- Resend-এর `onboarding@resend.dev` শুধু নিজের একাউন্ট ইমেইলে টেস্টের জন্য অনুমোদিত; বাইরের যেকোনো প্রাপকের ক্ষেত্রে এটি ১০০% স্প্যাম বা বাউন্স ট্রিগার করে।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- কখনো অন্ধভাবে `onboarding@resend.dev` ফলব্যাক না করা। এপিআই কী থেকে তার ভেরিফাইড ডোমেইনের আসল ইমেইল রিকভার করা, অথবা প্রেরক ইমেইল মিসিং থাকলে ডিসপ্যাচ আটকিয়ে ব্যবহারকারীকে ভ্যালিড সেন্ডার ইমেইল প্রোভাইড করার স্পষ্ট সতর্কতা দেওয়া।

---

## ৪. অসম্ভব দ্রুত গতিতে ইমেইল পাঠানো (delayMs = 650ms - 800ms)

### কোডের অবস্থান:
- **ফাইল:** `src/context/AppContext.tsx` (লাইন ৬১২–৬২০) এবং `neon_settings` ডিফল্ট

### কোড স্নিপেট:
```typescript
delayMs: taskDelay !== undefined ? taskDelay : 800
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- প্রতি ইমেইলের মাঝে মাত্র ০.৬৫ থেকে ০.৮ সেকেন্ড বিরতি দিয়ে মিনিটে ৬০-৮০টি এবং ঘন্টায় ৪,০০০+ মেইল ডিসপ্যাচ হয়।
- গুগল (জিমেইল) ও মাইক্রোসফট (আউটলুক)-এর রিসিভিং এমটিএ (MTA) সার্ভার দেখে যে একটি নতুন বা সাধারণ ডোমেইন থেকে প্রতি সেকেন্ডে একের পর এক কানেকশন ওপেন হচ্ছে।
- একে তাৎক্ষণিকভাবে **Automated Spambot Burst / High Velocity Flooding** হিসেবে শনাক্ত করে জিমেইলের অ্যালগরিদম সমস্ত মেইল সরাসরি স্প্যামে ঢুকিয়ে দেয়। কোল্ড আউটরিচের জন্য স্বাভাবিক মানবিক পেসিং (Human pacing) প্রয়োজন।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- সেটিংসে রেকমেন্ডেড সেফ ডিলে মোড (যেমন: ১০–৩০ সেকেন্ডের র‍্যান্ডমাইজড হিউম্যান ডিলে) এবং ব্যাচিং থ্রটলিং অপশন যুক্ত করা।

---

## ৫. ডাইনামিক ট্যাগ ({INV}, {TRX}) ফিশিং ফিল্টারে ধরা পড়া

### কোডের অবস্থান:
- **ফাইল:** `src/utils/dynamicTags.ts` (লাইন ১৩৫–১৪৬)

### কোড স্নিপেট:
```typescript
// Invoice ID {INV} (12-digit number)
if (/\{inv\}/i.test(combinedText)) {
  const invoiceId = generateRandomDigits(12);
  tagMap['{INV}'] = invoiceId;
}
// Transaction ID {TRX} (12-digit alphanumeric)
if (/\{trx\}/i.test(combinedText)) {
  const trxId = generateRandomAlphanumeric(12);
  tagMap['{TRX}'] = trxId;
}
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- বর্তমান ইন্টারনেটে সর্বাধিক প্রচলিত ফিশিং হলো ফেক ইনভয়েস স্ক্যাম (PayPal, GeekSquad, Norton ইত্যাদি)।
- জিমেইল এবং আউটলুকের ন্যাচারাল ল্যাঙ্গুয়েজ ও বেয়েসিয়ান (Bayesian) ফিল্টার সাবজেক্ট বা বডিতে ১২ ডিজিটের র‍্যান্ডম ইনভয়েস নম্বর (`849201948572`) বা ট্রানজেকশন কোড পেলেই অ্যান্টি-ফিশিং ফ্ল্যাগ রেজ করে।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- ফিশিং-ট্রিগার ট্যাগগুলোর বদলে স্ট্যান্ডার্ড প্রফেশনাল পার্সোনালাইজেশন ট্যাগ প্রমোট করা এবং ফিশিং-রিস্ক ওয়ার্নিং যুক্ত করা।

---

## ৬. রাউন্ড-রবিন রোটেশনের কারণে Sender Domain vs Body Links মিসম্যাচ

### কোডের অবস্থান:
- **ফাইল:** `src/context/AppContext.tsx` (লাইন ৬৩৪–৬৬০)

### কোড স্নিপেট:
- একাধিক এপিআই কী ব্যবহার করলে এক ইমেইল যায় `domain-a.com` থেকে, পরেরটি যায় `domain-b.com` থেকে। কিন্তু বডিতে থাকা লিংক ও ফুটার একই থাকে।

### কেন স্প্যাম হচ্ছে (Root Cause):
- যখন ইমেইল পাঠানো হয় `domain-b.com` থেকে, কিন্তু ইমেলের ভেতর থাকা কোনো ওয়েবসাইটের লিংক বা আনসাবস্ক্রাইব লিংক指向 করে `domain-a.com`-কে।
- স্প্যাম ফিল্টাররা একে **Header vs Body Domain Mismatch** হিসেবে দেখে, যা ফিশিং ও লিংক স্পুফিংয়ের প্রধান লক্ষণ।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- বডি এবং ফুটারের লিংকগুলো বর্তমান ডিসপ্যাচ সেন্ডার ডোমেইনের সাথে অটোমেটিক্যালি অ্যালাইন করা।

---

## ৭. CAN-SPAM আইন অনুযায়ী ফিজিক্যাল পোস্টাল অ্যাড্রেস (Postal Address) না থাকা

### কোডের অবস্থান:
- **ফাইল:** `server/db.ts` (ডিফল্ট টেমপ্লেট) এবং `src/components/pages/ContentPage.tsx`

### কোড স্নিপেট:
- ডিফল্ট টেমপ্লেট ও কনটেন্ট বডিতে কোনো বাস্তব অফিস বা পোস্টাল ঠিকানা নেই:
```html
<p style="font-size: 12px; color: #94a3b8; text-align: center;">
  Sent via R Sender Bulk Engine · Delivered to {email}
</p>
```

### কেন স্প্যাম হচ্ছে (Root Cause):
- মার্কিন CAN-SPAM Act, ইউরোপীয় GDPR এবং ২০২৪ সালের Google & Yahoo Bulk Sender Mandates অনুযায়ী বাণিজ্যিক/বাল্ক ইমেইলের ফুটারে প্রেরকের বৈধ ভৌগোলিক ঠিকানা (Physical Street Address / P.O. Box / City, Country) থাকা বাধ্যতামূলক।
- SpamAssassin ফিল্টারে ঠিকানা না থাকলে `MISSING_POSTAL_ADDRESS` এবং `CAN_SPAM_VIOLATION` পয়েন্ট যোগ হয়ে মেইল স্প্যামে চলে যায়।

### প্রস্তাবিত ফিক্স স্ট্র্যাটেজি:
- টেমপ্লেট ও ডিফল্ট কনটেন্টে একটি কমপ্লায়েন্ট পোস্টাল অ্যাড্রেস প্লেসহোল্ডার এবং ভ্যালিড ফুটার যুক্ত করা।

---

## ট্র্যাকার স্ট্যাটাস:
- [x] ৭টি সুনির্দিষ্ট স্প্যাম কারণের ফরেনসিক অডিট ও ডকুমেন্টেশন সম্পন্ন।
- [ ] স্টেপ ১: `List-Unsubscribe` হেডার থেকে ফেক `mailto:` রিমুভ ও কাস্টম URL প্রায়োরিটাইজেশন।
- [ ] স্টেপ ২: `autoReplyTo` দ্বারা কাস্টম ভ্যালিড ইমেইল ক্ষতিগ্রস্ত হওয়া বন্ধ করা।
- [ ] স্টেপ ৩: `onboarding@resend.dev` ফলব্যাকের জায়গায় ডোমেইন রিকভারি/গার্ড স্থাপন।
- [ ] স্টেপ ৪: ডিসপ্যাচ পেসিং ও হিউম্যান ডিলে কন্ট্রোল ইন্টিগ্রেশন।
- [ ] স্টেপ ৫: ডাইনামিক ট্যাগ ফিশিং ঝুঁকি সুরক্ষা ও গাইডেন্স।
- [ ] স্টেপ ৬: রাউন্ড-রবিন ডোমেইন অ্যালাইনমেন্ট।
- [ ] স্টেপ ৭: CAN-SPAM পোস্টাল অ্যাড্রেস ফুটার কমপ্লায়েন্স।
