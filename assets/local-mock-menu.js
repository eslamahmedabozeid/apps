/**
 * Local UI mock for school-menu when proxy is forced off (?localMock=1)
 * or when the local proxy cannot reach upstream.
 *
 * Labeled MOCK only — never treat as live/paid data.
 * Used only when window.SchoolLocalPreview is active (localhost / file).
 */
(function (global) {
  "use strict";

  var LOGO =
    "https://jmtqldgovmmhaystvpdu.supabase.co/storage/v1/object/public/school-menu/bls/logo.png";
  var HERO =
    "assets/photos/bag-hero.png";

  function riyadhToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function addDaysIso(iso, n) {
    var p = iso.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function mockDates() {
    var start = riyadhToday();
    var out = [];
    var i = 1;
    while (out.length < 12 && i < 40) {
      var iso = addDaysIso(start, i);
      var wd = new Date(iso + "T12:00:00Z").getUTCDay(); /* 5=Fri 6=Sat */
      out.push({ iso: iso, closed: wd === 5 || wd === 6 });
      i++;
    }
    return out;
  }

  var SCHOOLS = [
    {
      id: "bls",
      name_ar: "[MOCK] مدارس التعلم ثنائي اللغة",
      name_en: "[MOCK] Bilingual Learning Schools",
      logo_url: LOGO,
    },
    {
      id: "demo",
      name_ar: "[MOCK] مدرسة تجريبية",
      name_en: "[MOCK] Demo School",
      logo_url: "assets/logos/leaf-e-primary-green.png",
    },
  ];

  function schoolPayload(slug) {
    var id = (slug || "bls").toLowerCase();
    var meta =
      SCHOOLS.find(function (s) {
        return s.id === id;
      }) || SCHOOLS[0];
    return {
      _mock: true,
      _label: "LOCAL MOCK — not live school data",
      school: {
        id: meta.id,
        name_ar: meta.name_ar,
        name_en: meta.name_en,
        logo_url: meta.logo_url,
        hero_image_url: HERO,
        hero_tag_ar: "معاينة محلية",
        hero_tag_en: "Local preview",
        hero_title_ar: "وجبات [المدرسة] — بيانات تجريبية للواجهة",
        hero_title_en: "[School] meals — UI mock data",
        hero_sub_ar: "هذه بيانات وهمية للمعاينة فقط وليست منيو حقيقي.",
        hero_sub_en: "Mock data for UI preview only — not a live menu.",
        min_name_words: 2,
        cutoff_hour: 12,
        weeks_ahead: 4,
        week_days: [0, 1, 2, 3, 4],
        branches: [
          {
            id: "mock-branch-aqiq",
            slug: "aqiq",
            name_ar: "[MOCK] فرع العقيق",
            name_en: "[MOCK] Al Aqiq",
          },
          {
            id: "mock-branch-arid",
            slug: "arid",
            name_ar: "[MOCK] فرع العارض",
            name_en: "[MOCK] Al Arid",
          },
        ],
      },
      settings: { min_order_total: 24 },
      dates: mockDates(),
      server_time_riyadh: riyadhToday() + " 12:00:00",
      items: [
        {
          id: "mock-main-1",
          sku: "MOCK-CHICKEN",
          kind: "main",
          name_ar: "[MOCK] دجاج مشوي",
          name_en: "[MOCK] Grilled chicken",
          desc_ar: "طبق تجريبي للمعاينة",
          desc_en: "Preview-only dish",
          price: 18,
          tag_ar: "تجريبي",
          tag_en: "Mock",
          allergens: ["gluten"],
          kcal: 420,
          protein_g: 28,
          carbs_g: 35,
          fat_g: 12,
          image_url: "assets/photos/kids.png",
          sort: 1,
        },
        {
          id: "mock-main-2",
          sku: "MOCK-PASTA",
          kind: "main",
          name_ar: "[MOCK] مكرونة بالخضار",
          name_en: "[MOCK] Veggie pasta",
          desc_ar: "طبق تجريبي للمعاينة",
          desc_en: "Preview-only dish",
          price: 16,
          tag_ar: "تجريبي",
          tag_en: "Mock",
          allergens: ["gluten", "milk"],
          kcal: 380,
          protein_g: 14,
          carbs_g: 52,
          fat_g: 10,
          image_url: "assets/photos/bag-hero.png",
          sort: 2,
        },
        {
          id: "mock-addon-1",
          sku: "MOCK-JUICE",
          kind: "addon",
          name_ar: "[MOCK] عصير تفاح",
          name_en: "[MOCK] Apple juice",
          desc_ar: "",
          desc_en: "",
          price: 4,
          tag_ar: "",
          tag_en: "",
          allergens: [],
          kcal: 90,
          protein_g: 0,
          carbs_g: 22,
          fat_g: 0,
          image_url: "assets/logos/leaf-e-primary-green.png",
          sort: 10,
        },
        {
          id: "mock-addon-2",
          sku: "MOCK-YOGURT",
          kind: "addon",
          name_ar: "[MOCK] زبادي",
          name_en: "[MOCK] Yogurt",
          desc_ar: "",
          desc_en: "",
          price: 5,
          tag_ar: "",
          tag_en: "",
          allergens: ["milk"],
          kcal: 110,
          protein_g: 6,
          carbs_g: 12,
          fat_g: 4,
          image_url: "assets/logos/leaf-e-primary-green.png",
          sort: 11,
        },
      ],
    };
  }

  function listPayload() {
    return {
      _mock: true,
      _label: "LOCAL MOCK — not live school data",
      schools: SCHOOLS.slice(),
    };
  }

  global.SchoolLocalMock = {
    list: listPayload,
    menu: schoolPayload,
    label: "LOCAL MOCK — not live school data",
  };
})(typeof window !== "undefined" ? window : globalThis);
