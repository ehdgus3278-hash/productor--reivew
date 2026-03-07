const NAVER_API_URL = 'https://openapi.naver.com/v1/search/blog.json';

const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, OPTIONS'
        }
    });
};

const handleOptions = () => {
    return new Response(null, {
        status: 204,
        headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-allow-headers': 'content-type'
        }
    });
};

class TextCollector {
    constructor() {
        this.chunks = [];
    }

    text(text) {
        const value = text.text?.trim();
        if (value) {
            this.chunks.push(value);
        }
    }

    getText() {
        return this.chunks.join(' ');
    }
}

const normalizeBlogUrl = (url) => {
    if (!url) {
        return url;
    }

    if (url.includes('m.blog.naver.com')) {
        return url;
    }

    if (url.includes('blog.naver.com/PostView.nhn')) {
        try {
            const parsed = new URL(url);
            const blogId = parsed.searchParams.get('blogId');
            const logNo = parsed.searchParams.get('logNo');
            if (blogId && logNo) {
                return `https://m.blog.naver.com/${blogId}/${logNo}`;
            }
        } catch (error) {
            return url;
        }
    }

    if (url.includes('blog.naver.com/')) {
        return url.replace('blog.naver.com/', 'm.blog.naver.com/');
    }

    return url;
};

const extractBlogText = async (response) => {
    const collector = new TextCollector();
    const rewriter = new HTMLRewriter()
        .on('.se-main-container', collector)
        .on('#postViewArea', collector)
        .on('.post_view', collector)
        .on('.se_component_wrap', collector);

    const transformed = rewriter.transform(response);
    await transformed.text();
    const text = collector.getText();

    return text.replace(/\s+/g, ' ').trim();
};

const fetchBlogContent = async (url) => {
    const targetUrl = normalizeBlogUrl(url);
    if (!targetUrl) {
        return { url, text: '', error: 'invalid_url' };
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'user-agent': 'Mozilla/5.0 (compatible; BlogCrawler/1.0)',
                'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5'
            }
        });

        if (!response.ok) {
            return { url: targetUrl, text: '', error: `http_${response.status}` };
        }

        const text = await extractBlogText(response);
        return { url: targetUrl, text, error: text ? null : 'empty' };
    } catch (error) {
        return { url: targetUrl, text: '', error: 'fetch_failed' };
    }
};

const mapWithConcurrency = async (items, limit, mapper) => {
    const results = new Array(items.length);
    let index = 0;

    const run = async () => {
        while (index < items.length) {
            const current = index;
            index += 1;
            results[current] = await mapper(items[current], current);
        }
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
    await Promise.all(workers);
    return results;
};

const fetchSearchResults = async (keyword, env) => {
    const clientId = env.NAVER_CLIENT_ID;
    const clientSecret = env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return {
            error: 'missing_credentials',
            message: 'Set NAVER_CLIENT_ID and NAVER_CLIENT_SECRET in Cloudflare Pages environment variables.',
            items: []
        };
    }

    const url = new URL(NAVER_API_URL);
    url.searchParams.set('query', keyword);
    url.searchParams.set('display', '10');
    url.searchParams.set('start', '1');
    url.searchParams.set('sort', 'sim');

    const response = await fetch(url.toString(), {
        headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret
        }
    });

    if (!response.ok) {
        return {
            error: `naver_http_${response.status}`,
            message: `Naver API request failed with status ${response.status}.`,
            items: []
        };
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    return { error: null, items };
};

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return handleOptions();
    }

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    const url = new URL(request.url);
    const keyword = (url.searchParams.get('q') || '').trim();

    if (!keyword) {
        return jsonResponse({ error: 'missing_query', items: [] }, 400);
    }

    const { error, message, items } = await fetchSearchResults(keyword, env);
    if (error) {
        return jsonResponse({ error, message: message || 'Upstream error.', items: [] }, 502);
    }

    const blogContents = await mapWithConcurrency(items, 3, async (item) => {
        const content = await fetchBlogContent(item.link);
        return {
            link: item.link,
            contentUrl: content.url,
            contentText: content.text,
            contentError: content.error
        };
    });

    const enriched = items.map((item, idx) => {
        const content = blogContents[idx] || {};
        return {
            ...item,
            contentUrl: content.contentUrl || item.link,
            contentText: content.contentText || '',
            contentError: content.contentError || null
        };
    });

    return jsonResponse({ error: null, items: enriched });
}
