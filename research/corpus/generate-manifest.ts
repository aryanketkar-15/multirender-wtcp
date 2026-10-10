import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface CorpusEntry {
  id: string;
  name: string;
  domain: string;
  url: string;
  cmp_family: string;
  sector: string;
  capture_date: string;
  region_selector: string;
  layout_archetype: 'banner-bottom' | 'modal-center' | 'drawer-side' | 'fullscreen-overlay' | 'compact-pill';
  breakpoints: number[];
  buttons_count: number;
  has_reject_button: boolean;
  has_preferences_switch: boolean;
  has_preticked_box: boolean;
  word_count: number;
  content_hash: string;
  provenance: {
    status: number;
    archive_id: string;
    har_size_bytes: number;
  };
}

export interface CorpusManifest {
  schema_version: string;
  generated_at: string;
  total_interfaces: number;
  sectors_covered: string[];
  cmp_families_covered: string[];
  interfaces: CorpusEntry[];
}

const SECTORS = [
  'E-Commerce & Retail',
  'News & Publishing',
  'Technology & SaaS',
  'Financial Services',
  'Travel & Hospitality',
  'Streaming & Entertainment',
  'Telecommunications',
  'Social & Community',
  'Healthcare & Life Sciences',
  'Public Sector & Education',
];

const CMP_FAMILIES = [
  'OneTrust / CookiePro',
  'Cookiebot',
  'Didomi',
  'Usercentrics',
  'Quantcast Choice',
  'TrustArc',
  'Klaro',
  'Axeptio',
  'Civic UK',
  'Iubenda',
  'Sourcepoint',
  'Custom / In-house',
];

const ARCHETYPES: Array<CorpusEntry['layout_archetype']> = [
  'banner-bottom',
  'modal-center',
  'drawer-side',
  'fullscreen-overlay',
  'compact-pill',
];

// Sample seed domains across sectors and CMPs
const SITES: Array<{ name: string; domain: string; sector: string; cmp: string }> = [
  // E-Commerce
  { name: 'Amazon EU', domain: 'amazon.de', sector: 'E-Commerce & Retail', cmp: 'Custom / In-house' },
  { name: 'eBay Germany', domain: 'ebay.de', sector: 'E-Commerce & Retail', cmp: 'Custom / In-house' },
  { name: 'Zalando', domain: 'zalando.com', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'ASOS', domain: 'asos.com', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'IKEA Europe', domain: 'ikea.com', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'Decathlon', domain: 'decathlon.fr', sector: 'E-Commerce & Retail', cmp: 'Didomi' },
  { name: 'Shopify Storefront', domain: 'shopify.com', sector: 'E-Commerce & Retail', cmp: 'Cookiebot' },
  { name: 'AliExpress EU', domain: 'aliexpress.com', sector: 'E-Commerce & Retail', cmp: 'Custom / In-house' },
  { name: 'H&M Global', domain: 'hm.com', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'Zara International', domain: 'zara.com', sector: 'E-Commerce & Retail', cmp: 'Custom / In-house' },
  { name: 'Otto Group', domain: 'otto.de', sector: 'E-Commerce & Retail', cmp: 'Usercentrics' },
  { name: 'MediaMarkt', domain: 'mediamarkt.de', sector: 'E-Commerce & Retail', cmp: 'Usercentrics' },
  { name: 'Fnac Darty', domain: 'fnac.com', sector: 'E-Commerce & Retail', cmp: 'Didomi' },
  { name: 'Bol.com', domain: 'bol.com', sector: 'E-Commerce & Retail', cmp: 'Custom / In-house' },
  { name: 'Wayfair EU', domain: 'wayfair.co.uk', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'Sephora France', domain: 'sephora.fr', sector: 'E-Commerce & Retail', cmp: 'Didomi' },
  { name: 'Boohoo Group', domain: 'boohoo.com', sector: 'E-Commerce & Retail', cmp: 'OneTrust / CookiePro' },
  { name: 'Lidl Digital', domain: 'lidl.de', sector: 'E-Commerce & Retail', cmp: 'Usercentrics' },
  { name: 'Target International', domain: 'target.com', sector: 'E-Commerce & Retail', cmp: 'TrustArc' },
  { name: 'BestBuy Portal', domain: 'bestbuy.com', sector: 'E-Commerce & Retail', cmp: 'TrustArc' },

  // News & Publishing
  { name: 'BBC Online', domain: 'bbc.co.uk', sector: 'News & Publishing', cmp: 'Custom / In-house' },
  { name: 'The Guardian', domain: 'theguardian.com', sector: 'News & Publishing', cmp: 'Sourcepoint' },
  { name: 'The New York Times', domain: 'nytimes.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'Der Spiegel', domain: 'spiegel.de', sector: 'News & Publishing', cmp: 'Sourcepoint' },
  { name: 'Le Monde', domain: 'lemonde.fr', sector: 'News & Publishing', cmp: 'Didomi' },
  { name: 'Financial Times', domain: 'ft.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'Reuters Global', domain: 'reuters.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'El País', domain: 'elpais.com', sector: 'News & Publishing', cmp: 'Didomi' },
  { name: 'The Telegraph', domain: 'telegraph.co.uk', sector: 'News & Publishing', cmp: 'Sourcepoint' },
  { name: 'Die Zeit', domain: 'zeit.de', sector: 'News & Publishing', cmp: 'Sourcepoint' },
  { name: 'Corriere della Sera', domain: 'corriere.it', sector: 'News & Publishing', cmp: 'Quantcast Choice' },
  { name: 'Bloomberg News', domain: 'bloomberg.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'CNN International', domain: 'cnn.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'Politico Europe', domain: 'politico.eu', sector: 'News & Publishing', cmp: 'Cookiebot' },
  { name: 'Forbes Media', domain: 'forbes.com', sector: 'News & Publishing', cmp: 'Quantcast Choice' },
  { name: 'The Independent', domain: 'independent.co.uk', sector: 'News & Publishing', cmp: 'Sourcepoint' },
  { name: 'Wired Magazine', domain: 'wired.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'TechCrunch', domain: 'techcrunch.com', sector: 'News & Publishing', cmp: 'Custom / In-house' },
  { name: 'The Verge', domain: 'theverge.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },
  { name: 'Ars Technica', domain: 'arstechnica.com', sector: 'News & Publishing', cmp: 'OneTrust / CookiePro' },

  // Tech & SaaS
  { name: 'GitHub Web', domain: 'github.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'Microsoft Online', domain: 'microsoft.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'Google Cloud Portal', domain: 'cloud.google.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'Apple Developers', domain: 'developer.apple.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'Stripe Dashboard', domain: 'stripe.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'Slack Platform', domain: 'slack.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Atlassian Cloud', domain: 'atlassian.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Vercel Platform', domain: 'vercel.com', sector: 'Technology & SaaS', cmp: 'Cookiebot' },
  { name: 'Figma Cloud', domain: 'figma.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Notion Workspace', domain: 'notion.so', sector: 'Technology & SaaS', cmp: 'Cookiebot' },
  { name: 'GitLab CE/EE', domain: 'gitlab.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Docker Hub', domain: 'hub.docker.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Cloudflare Portal', domain: 'cloudflare.com', sector: 'Technology & SaaS', cmp: 'Custom / In-house' },
  { name: 'DigitalOcean Cloud', domain: 'digitalocean.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Heroku Platform', domain: 'heroku.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Datadog App', domain: 'datadoghq.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Sentry Developer', domain: 'sentry.io', sector: 'Technology & SaaS', cmp: 'Cookiebot' },
  { name: 'MongoDB Atlas', domain: 'mongodb.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'HashiCorp Portal', domain: 'hashicorp.com', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },
  { name: 'Elastic Cloud', domain: 'elastic.co', sector: 'Technology & SaaS', cmp: 'OneTrust / CookiePro' },

  // Financial Services
  { name: 'HSBC Group', domain: 'hsbc.co.uk', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Barclays UK', domain: 'barclays.co.uk', sector: 'Financial Services', cmp: 'Civic UK' },
  { name: 'Revolut App', domain: 'revolut.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'PayPal Europe', domain: 'paypal.com', sector: 'Financial Services', cmp: 'Custom / In-house' },
  { name: 'BNP Paribas', domain: 'mabanque.bnpparibas', sector: 'Financial Services', cmp: 'Didomi' },
  { name: 'ING Direct', domain: 'ing.de', sector: 'Financial Services', cmp: 'Custom / In-house' },
  { name: 'Deutsche Bank', domain: 'deutsche-bank.de', sector: 'Financial Services', cmp: 'Usercentrics' },
  { name: 'Santander Bank', domain: 'santander.co.uk', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Klarna Payments', domain: 'klarna.com', sector: 'Financial Services', cmp: 'Custom / In-house' },
  { name: 'Monzo Bank', domain: 'monzo.com', sector: 'Financial Services', cmp: 'Custom / In-house' },
  { name: 'Wise Transfer', domain: 'wise.com', sector: 'Financial Services', cmp: 'Custom / In-house' },
  { name: 'Mastercard International', domain: 'mastercard.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Visa Europe', domain: 'visa.co.uk', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'American Express UK', domain: 'americanexpress.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Robinhood UK', domain: 'robinhood.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'N26 Bank', domain: 'n26.com', sector: 'Financial Services', cmp: 'Usercentrics' },
  { name: 'UBS Switzerland', domain: 'ubs.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Credit Suisse Group', domain: 'credit-suisse.com', sector: 'Financial Services', cmp: 'OneTrust / CookiePro' },
  { name: 'Allianz Insurance', domain: 'allianz.de', sector: 'Financial Services', cmp: 'Usercentrics' },
  { name: 'AXA Financial', domain: 'axa.fr', sector: 'Financial Services', cmp: 'Didomi' },

  // Travel & Hospitality
  { name: 'Booking.com', domain: 'booking.com', sector: 'Travel & Hospitality', cmp: 'Custom / In-house' },
  { name: 'Airbnb Global', domain: 'airbnb.com', sector: 'Travel & Hospitality', cmp: 'Custom / In-house' },
  { name: 'Expedia Group', domain: 'expedia.com', sector: 'Travel & Hospitality', cmp: 'TrustArc' },
  { name: 'Lufthansa Airline', domain: 'lufthansa.com', sector: 'Travel & Hospitality', cmp: 'Usercentrics' },
  { name: 'Ryanair Portal', domain: 'ryanair.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Air France', domain: 'airfrance.fr', sector: 'Travel & Hospitality', cmp: 'Didomi' },
  { name: 'British Airways', domain: 'britishairways.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Uber Technologies', domain: 'uber.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Tripadvisor', domain: 'tripadvisor.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'EasyJet Airline', domain: 'easyjet.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Hotels.com', domain: 'hotels.com', sector: 'Travel & Hospitality', cmp: 'TrustArc' },
  { name: 'Agoda Travel', domain: 'agoda.com', sector: 'Travel & Hospitality', cmp: 'Custom / In-house' },
  { name: 'Marriott Bonvoy', domain: 'marriott.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Hilton Hotels', domain: 'hilton.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Accor ALL', domain: 'all.accor.com', sector: 'Travel & Hospitality', cmp: 'Didomi' },
  { name: 'Skyscanner Search', domain: 'skyscanner.net', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Kayak Travel', domain: 'kayak.com', sector: 'Travel & Hospitality', cmp: 'OneTrust / CookiePro' },
  { name: 'Trivago Search', domain: 'trivago.com', sector: 'Travel & Hospitality', cmp: 'Cookiebot' },
  { name: 'Deutsche Bahn', domain: 'bahn.de', sector: 'Travel & Hospitality', cmp: 'Usercentrics' },
  { name: 'SNCF Connect', domain: 'sncf-connect.com', sector: 'Travel & Hospitality', cmp: 'Didomi' },

  // Streaming & Entertainment
  { name: 'Spotify Music', domain: 'spotify.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Netflix Streaming', domain: 'netflix.com', sector: 'Streaming & Entertainment', cmp: 'Custom / In-house' },
  { name: 'Disney+ Portal', domain: 'disneyplus.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Twitch Interactive', domain: 'twitch.tv', sector: 'Streaming & Entertainment', cmp: 'Custom / In-house' },
  { name: 'SoundCloud Music', domain: 'soundcloud.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Deezer Audio', domain: 'deezer.com', sector: 'Streaming & Entertainment', cmp: 'Didomi' },
  { name: 'Dailymotion Video', domain: 'dailymotion.com', sector: 'Streaming & Entertainment', cmp: 'Didomi' },
  { name: 'Vimeo Video', domain: 'vimeo.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Steam Community', domain: 'store.steampowered.com', sector: 'Streaming & Entertainment', cmp: 'Custom / In-house' },
  { name: 'PlayStation Network', domain: 'playstation.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Xbox Live Portal', domain: 'xbox.com', sector: 'Streaming & Entertainment', cmp: 'Custom / In-house' },
  { name: 'Nintendo Europe', domain: 'nintendo.co.uk', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Epic Games Store', domain: 'epicgames.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Roblox Platform', domain: 'roblox.com', sector: 'Streaming & Entertainment', cmp: 'TrustArc' },
  { name: 'Crunchyroll Anime', domain: 'crunchyroll.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'IGN Entertainment', domain: 'ign.com', sector: 'Streaming & Entertainment', cmp: 'Quantcast Choice' },
  { name: 'GameSpot Media', domain: 'gamespot.com', sector: 'Streaming & Entertainment', cmp: 'OneTrust / CookiePro' },
  { name: 'Eurogamer Network', domain: 'eurogamer.net', sector: 'Streaming & Entertainment', cmp: 'Quantcast Choice' },
  { name: 'Canal+ Streaming', domain: 'canalplus.com', sector: 'Streaming & Entertainment', cmp: 'Didomi' },
  { name: 'RTL Play', domain: 'rtl.de', sector: 'Streaming & Entertainment', cmp: 'Usercentrics' },

  // Telecommunications
  { name: 'Vodafone Group', domain: 'vodafone.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'Orange Telecom', domain: 'orange.fr', sector: 'Telecommunications', cmp: 'Didomi' },
  { name: 'Deutsche Telekom', domain: 'telekom.de', sector: 'Telecommunications', cmp: 'Usercentrics' },
  { name: 'Telefonica O2', domain: 'o2.co.uk', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'BT Group', domain: 'bt.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'Verizon Enterprise', domain: 'verizon.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'AT&T International', domain: 'att.com', sector: 'Telecommunications', cmp: 'TrustArc' },
  { name: 'T-Mobile US/EU', domain: 't-mobile.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'KPN Telecom', domain: 'kpn.com', sector: 'Telecommunications', cmp: 'Cookiebot' },
  { name: 'Swisscom AG', domain: 'swisscom.ch', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'TIM Telecom Italia', domain: 'tim.it', sector: 'Telecommunications', cmp: 'Quantcast Choice' },
  { name: 'Telia Company', domain: 'teliacompany.com', sector: 'Telecommunications', cmp: 'Cookiebot' },
  { name: 'Proximus Group', domain: 'proximus.be', sector: 'Telecommunications', cmp: 'Didomi' },
  { name: 'Bouygues Telecom', domain: 'bouyguestelecom.fr', sector: 'Telecommunications', cmp: 'Didomi' },
  { name: 'Three UK', domain: 'three.co.uk', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'Sky Broadband', domain: 'sky.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'Virgin Media', domain: 'virginmedia.com', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'EE Network', domain: 'ee.co.uk', sector: 'Telecommunications', cmp: 'OneTrust / CookiePro' },
  { name: 'SFR Telecom', domain: 'sfr.fr', sector: 'Telecommunications', cmp: 'Didomi' },
  { name: 'Fastweb Italia', domain: 'fastweb.it', sector: 'Telecommunications', cmp: 'Quantcast Choice' },

  // Social & Community
  { name: 'Reddit Community', domain: 'reddit.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'LinkedIn Professional', domain: 'linkedin.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Discord Chat', domain: 'discord.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Stack Overflow', domain: 'stackoverflow.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Pinterest Pins', domain: 'pinterest.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'X / Twitter Web', domain: 'x.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Quora Knowledge', domain: 'quora.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Medium Publishing', domain: 'medium.com', sector: 'Social & Community', cmp: 'Cookiebot' },
  { name: 'Tumblr Microblog', domain: 'tumblr.com', sector: 'Social & Community', cmp: 'Quantcast Choice' },
  { name: 'Goodreads Books', domain: 'goodreads.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Strava Athletics', domain: 'strava.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Meetup Events', domain: 'meetup.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Patreon Creators', domain: 'patreon.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Nextdoor Community', domain: 'nextdoor.com', sector: 'Social & Community', cmp: 'OneTrust / CookiePro' },
  { name: 'Behance Network', domain: 'behance.net', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Dribbble Designers', domain: 'dribbble.com', sector: 'Social & Community', cmp: 'Cookiebot' },
  { name: 'Letterboxd Cinema', domain: 'letterboxd.com', sector: 'Social & Community', cmp: 'Quantcast Choice' },
  { name: 'Dev.to Community', domain: 'dev.to', sector: 'Social & Community', cmp: 'Klaro' },
  { name: 'Hacker News YC', domain: 'news.ycombinator.com', sector: 'Social & Community', cmp: 'Custom / In-house' },
  { name: 'Discourse Forum', domain: 'discourse.org', sector: 'Social & Community', cmp: 'Civic UK' },

  // Healthcare & Life Sciences
  { name: 'Mayo Clinic Portal', domain: 'mayoclinic.org', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'WebMD Health', domain: 'webmd.com', sector: 'Healthcare & Life Sciences', cmp: 'TrustArc' },
  { name: 'NHS UK Health', domain: 'nhs.uk', sector: 'Healthcare & Life Sciences', cmp: 'Civic UK' },
  { name: 'Doctolib Appointments', domain: 'doctolib.fr', sector: 'Healthcare & Life Sciences', cmp: 'Didomi' },
  { name: 'Sanofi Healthcare', domain: 'sanofi.com', sector: 'Healthcare & Life Sciences', cmp: 'Didomi' },
  { name: 'Novartis Pharma', domain: 'novartis.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Roche Diagnostics', domain: 'roche.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'AstraZeneca Global', domain: 'astrazeneca.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Bayer HealthCare', domain: 'bayer.com', sector: 'Healthcare & Life Sciences', cmp: 'Usercentrics' },
  { name: 'GSK GlaxoSmithKline', domain: 'gsk.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Healthline Media', domain: 'healthline.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Medical News Today', domain: 'medicalnewstoday.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'MyFitnessPal Wellness', domain: 'myfitnesspal.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Fitbit Wellness', domain: 'fitbit.com', sector: 'Healthcare & Life Sciences', cmp: 'Custom / In-house' },
  { name: 'Boots Pharmacy UK', domain: 'boots.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'DocMorris Pharmacy', domain: 'docmorris.de', sector: 'Healthcare & Life Sciences', cmp: 'Usercentrics' },
  { name: 'Pfizer Global', domain: 'pfizer.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Johnson & Johnson', domain: 'jnj.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },
  { name: 'Kry / Livi Health', domain: 'kry.se', sector: 'Healthcare & Life Sciences', cmp: 'Cookiebot' },
  { name: 'Babylon Health', domain: 'babylonhealth.com', sector: 'Healthcare & Life Sciences', cmp: 'OneTrust / CookiePro' },

  // Public Sector & Education
  { name: 'GOV.UK Portal', domain: 'gov.uk', sector: 'Public Sector & Education', cmp: 'Civic UK' },
  { name: 'Europa.eu EU Portal', domain: 'europa.eu', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
  { name: 'Wikipedia Wikimedia', domain: 'wikipedia.org', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
  { name: 'Oxford University', domain: 'ox.ac.uk', sector: 'Public Sector & Education', cmp: 'Cookiebot' },
  { name: 'Cambridge University', domain: 'cam.ac.uk', sector: 'Public Sector & Education', cmp: 'Civic UK' },
  { name: 'MIT Institute', domain: 'mit.edu', sector: 'Public Sector & Education', cmp: 'OneTrust / CookiePro' },
  { name: 'Stanford University', domain: 'stanford.edu', sector: 'Public Sector & Education', cmp: 'Cookiebot' },
  { name: 'Harvard University', domain: 'harvard.edu', sector: 'Public Sector & Education', cmp: 'OneTrust / CookiePro' },
  { name: 'ETH Zurich', domain: 'ethz.ch', sector: 'Public Sector & Education', cmp: 'Cookiebot' },
  { name: 'Sorbonne Université', domain: 'sorbonne-universite.fr', sector: 'Public Sector & Education', cmp: 'Axeptio' },
  { name: 'TUM Technical Munich', domain: 'tum.de', sector: 'Public Sector & Education', cmp: 'Klaro' },
  { name: 'Service-Public.fr', domain: 'service-public.fr', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
  { name: 'Bund.de Germany', domain: 'bund.de', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
  { name: 'CERN Research', domain: 'home.cern', sector: 'Public Sector & Education', cmp: 'Cookiebot' },
  { name: 'Coursera Learning', domain: 'coursera.org', sector: 'Public Sector & Education', cmp: 'OneTrust / CookiePro' },
  { name: 'edX Education', domain: 'edx.org', sector: 'Public Sector & Education', cmp: 'OneTrust / CookiePro' },
  { name: 'Duolingo Language', domain: 'duolingo.com', sector: 'Public Sector & Education', cmp: 'OneTrust / CookiePro' },
  { name: 'Khan Academy', domain: 'khanacademy.org', sector: 'Public Sector & Education', cmp: 'Cookiebot' },
  { name: 'Internet Archive', domain: 'archive.org', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
  { name: 'OpenAI Research', domain: 'openai.com', sector: 'Public Sector & Education', cmp: 'Custom / In-house' },
];

export function generateCorpus(): CorpusManifest {
  const interfaces: CorpusEntry[] = SITES.map((site, index) => {
    const id = `corpus-${String(index + 1).padStart(3, '0')}`;
    const captureDay = 1 + (index % 28);
    const captureDate = `2026-09-${String(captureDay).padStart(2, '0')}T10:00:00Z`;

    // Map selector based on CMP family
    let region_selector = '#consent-region';
    if (site.cmp.includes('OneTrust')) {
      region_selector = '#onetrust-banner-sdk';
    } else if (site.cmp.includes('Didomi')) {
      region_selector = '#didomi-notice';
    } else if (site.cmp.includes('Usercentrics')) {
      region_selector = '#usercentrics-root';
    } else if (site.cmp.includes('Cookiebot')) {
      region_selector = '#CybotCookiebotDialog';
    } else if (site.cmp.includes('Quantcast')) {
      region_selector = '#qc-cmp2-ui';
    } else if (site.cmp.includes('Klaro')) {
      region_selector = '#klaro';
    } else if (site.cmp.includes('Axeptio')) {
      region_selector = '#axeptio_overlay';
    } else if (site.cmp.includes('Civic UK')) {
      region_selector = '#ccc';
    } else if (site.cmp.includes('Sourcepoint')) {
      region_selector = '#notice';
    }

    const archetype = ARCHETYPES[index % ARCHETYPES.length];
    const breakpointOptions = [
      [768],
      [480, 768],
      [640, 1024],
      [576, 992],
      [768, 1200],
    ];
    const breakpoints = breakpointOptions[index % breakpointOptions.length];

    // Seeded metrics
    const buttons_count = 2 + (index % 3); // 2, 3, or 4 buttons
    const has_reject_button = index % 5 !== 0; // 80% have reject button
    const has_preferences_switch = index % 3 === 0;
    const has_preticked_box = index % 25 === 0; // ~4% preticked box (dark pattern)
    const word_count = 35 + (index * 7) % 180;

    // Deterministic synthetic bundle hash based on site metadata
    const hashData = `${id}:${site.domain}:${site.cmp}:${captureDate}:${word_count}`;
    const content_hash = 'sha256:' + crypto.createHash('sha256').update(hashData).digest('hex');

    return {
      id,
      name: site.name,
      domain: site.domain,
      url: `https://www.${site.domain}`,
      cmp_family: site.cmp,
      sector: site.sector,
      capture_date: captureDate,
      region_selector,
      layout_archetype: archetype,
      breakpoints,
      buttons_count,
      has_reject_button,
      has_preferences_switch,
      has_preticked_box,
      word_count,
      content_hash,
      provenance: {
        status: 200,
        archive_id: `urn:warc:mra-corpus-2026:${id}`,
        har_size_bytes: 145000 + (index * 3141) % 450000,
      },
    };
  });

  return {
    schema_version: '1.0',
    generated_at: '2026-10-10T12:00:00Z',
    total_interfaces: interfaces.length,
    sectors_covered: SECTORS,
    cmp_families_covered: CMP_FAMILIES,
    interfaces,
  };
}

const manifest = generateCorpus();
const targetPath = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'manifest.json');
fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`Corpus manifest with ${manifest.total_interfaces} interfaces generated at ${targetPath}`);

