(function initSiteRulePresets(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  namespace.siteRulePresets = [
    {
      id: "preset-social-twitter",
      hostPattern: "twitter.com",
      enabled: true,
      source: "preset",
      category: "social",
      includeSelectors: [
        "article [data-testid='tweetText']",
        "article div[lang]"
      ],
      excludeSelectors: [],
      contextStyle: "casual"
    },
    {
      id: "preset-social-x",
      hostPattern: "x.com",
      enabled: true,
      source: "preset",
      category: "social",
      includeSelectors: [
        "article [data-testid='tweetText']",
        "article div[lang]"
      ],
      excludeSelectors: [],
      contextStyle: "casual"
    },
    {
      id: "preset-social-facebook",
      hostPattern: "facebook.com",
      enabled: true,
      source: "preset",
      category: "social",
      includeSelectors: ["[role='article']"],
      excludeSelectors: [],
      contextStyle: "casual"
    },
    {
      id: "preset-social-reddit",
      hostPattern: "reddit.com",
      enabled: true,
      source: "preset",
      category: "social",
      includeSelectors: [
        "shreddit-post",
        "[data-testid='post-container']",
        "[slot='comment']"
      ],
      excludeSelectors: [],
      contextStyle: "casual"
    },
    {
      id: "preset-academic-arxiv",
      hostPattern: "arxiv.org",
      enabled: true,
      source: "preset",
      category: "academic",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "formal"
    },
    {
      id: "preset-academic-scholar",
      hostPattern: "scholar.google.com",
      enabled: true,
      source: "preset",
      category: "academic",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "formal"
    },
    {
      id: "preset-academic-pubmed",
      hostPattern: "pubmed.ncbi.nlm.nih.gov",
      enabled: true,
      source: "preset",
      category: "academic",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "formal"
    },
    {
      id: "preset-docs-github",
      hostPattern: "docs.github.com",
      enabled: true,
      source: "preset",
      category: "docs",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "formal"
    },
    {
      id: "preset-docs-mdn",
      hostPattern: "developer.mozilla.org",
      enabled: true,
      source: "preset",
      category: "docs",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "formal"
    },
    {
      id: "preset-news-slashdot",
      hostPattern: "slashdot.org",
      enabled: true,
      source: "preset",
      category: "news",
      includeSelectors: [
        "article.fhitem-story .story-title",
        "article.fhitem-story .story-byline",
        "article.fhitem-story .body .p",
        "article.fhitem-story .commentBody .p",
        "article.fhitem-story .commentBody li",
        "article.fhitem-story .related h3",
        "article.fhitem-story .related a"
      ],
      excludeSelectors: [],
      contextStyle: "neutral"
    },
    {
      id: "preset-news-rocketnews24",
      hostPattern: "rocketnews24.com",
      enabled: true,
      source: "preset",
      category: "news",
      includeSelectors: [
        "#content #main-content .post-header .post-series a",
        "#content #main-content .post-header .entry-title",
        "#content #main-content .post-header .post-meta .date",
        "#content #main-content .entry-content > p",
        "#content #main-content .entry-content > h2",
        "#content #main-content .entry-content > h3",
        "#content #main-content .entry-content > h4",
        "#content #main-content .linkbox a",
        "#content #main-content .linkbox .title",
        "#content #main-content .related-entry-title"
      ],
      excludeSelectors: [
        ".ad",
        ".share-btns",
        ".author"
      ],
      contextStyle: "casual"
    },
    {
      id: "preset-news-apnews",
      hostPattern: "apnews.com",
      enabled: true,
      source: "preset",
      category: "news",
      includeSelectors: [
        ".Page-breadcrumbs a",
        ".Page-headline",
        ".Figure-caption p",
        ".Page-byline .Page-authors",
        ".Page-dateModified span[data-date]",
        ".RichTextStoryBody > p",
        ".RichTextBody > p",
        ".RichTextStoryBody > h2",
        ".RichTextBody > h2",
        ".RichTextStoryBody > h3",
        ".RichTextBody > h3",
        ".PageList-header-title",
        ".PageList-header-description",
        ".PagePromoContentIcons-text"
      ],
      excludeSelectors: [
        ".Advertisement",
        ".Page-actions",
        ".MainNavigation"
      ],
      contextStyle: "neutral"
    },
    {
      id: "preset-video-youtube",
      hostPattern: "youtube.com",
      enabled: true,
      source: "preset",
      category: "video",
      includeSelectors: [
        "ytd-rich-grid-renderer h3.ytLockupMetadataViewModelHeadingReset",
        "ytd-rich-item-renderer h3.ytLockupMetadataViewModelHeadingReset",
        "ytd-rich-shelf-renderer h3.shortsLockupViewModelHostMetadataTitle",
        "ytd-reel-shelf-renderer h3.shortsLockupViewModelHostMetadataTitle",
        "ytd-watch-metadata #title h1",
        "ytd-watch-metadata #description-inline-expander #expanded yt-attributed-string > span.ytAttributedStringHost",
        "ytd-watch-metadata #description #attributed-snippet-text > span.ytAttributedStringHost",
        "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-structured-description'] #attributed-snippet-text > span.ytAttributedStringHost",
        "ytd-comments-header-renderer #count",
        "ytd-comments ytd-comment-view-model #content-text span[role='text']"
      ],
      excludeSelectors: [
        "#secondary",
        "#related",
        "#masthead",
        "#guide",
        "#actions",
        "ytd-watch-next-secondary-results-renderer",
        "ytd-compact-video-renderer",
        "ytd-compact-radio-renderer",
        "ytd-compact-playlist-renderer",
        "ytd-masthead",
        "ytd-guide-renderer",
        "ytd-menu-renderer",
        "ytd-menu-popup-renderer",
        "yt-chip-cloud-renderer"
      ],
      contextStyle: "casual"
    },
    {
      id: "preset-video-netflix",
      hostPattern: "netflix.com",
      enabled: true,
      source: "preset",
      category: "video",
      includeSelectors: [],
      excludeSelectors: [],
      contextStyle: "casual"
    }
  ];
}(globalThis));
