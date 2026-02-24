class ReviewCard extends HTMLElement {
    constructor() {
        super();
        const template = document.getElementById('review-card-template').content;
        this.attachShadow({ mode: 'open' }).appendChild(template.cloneNode(true));
    }

    set review(review) {
        this.shadowRoot.querySelector('a').href = review.url;
        this.shadowRoot.querySelector('a').textContent = review.url;
        this.shadowRoot.querySelector('span').textContent = review.rating;
        this.shadowRoot.querySelectorAll('p')[2].textContent = review.text;
    }
}

customElements.define('review-card', ReviewCard);

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const searchStatus = document.getElementById('search-status');
    const searchResults = document.getElementById('search-results');
    const userReview = document.getElementById('user-review');
    const generateButton = document.getElementById('generate-button');
    const copyButton = document.getElementById('copy-button');
    const draftStatus = document.getElementById('draft-status');
    const draftOutput = document.getElementById('draft-output');
    const reviewForm = document.getElementById('review-form');
    const reviewsContainer = document.getElementById('reviews-container');

    const USER_REVIEW_KEY = 'user_review_text';
    let latestSearchItems = [];

    const stripHtml = (value) => value.replace(/<[^>]*>/g, '');
    const decodeHtml = (value) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    };
    const cleanText = (value) => decodeHtml(stripHtml(value || ''));

    const renderResults = (items) => {
        if (!items.length) {
            searchResults.innerHTML = '<p class="empty">검색 결과가 없습니다.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.className = 'result-list';

        items.forEach((item) => {
            const listItem = document.createElement('li');
            listItem.className = 'result-item';

            const title = cleanText(item.title);
            const description = cleanText(item.description);
            const bloggerName = cleanText(item.bloggername);
            const postDate = cleanText(item.postdate);

            listItem.innerHTML = `
                <a class="result-title" href="${item.link}" target="_blank" rel="noopener noreferrer">${title}</a>
                <div class="result-meta">
                    <span>${bloggerName}</span>
                    <span>${postDate}</span>
                </div>
                <p class="result-desc">${description}</p>
            `;

            list.appendChild(listItem);
        });

        searchResults.innerHTML = '';
        searchResults.appendChild(list);
    };

    const setStatus = (message, isError = false) => {
        searchStatus.textContent = message;
        searchStatus.classList.toggle('error', isError);
    };

    const setDraftStatus = (message, isError = false) => {
        draftStatus.textContent = message;
        draftStatus.classList.toggle('error', isError);
    };

    const runSearch = async () => {
        const keyword = searchInput.value.trim();
        if (!keyword) {
            setStatus('검색어를 입력해 주세요.', true);
            searchResults.innerHTML = '';
            latestSearchItems = [];
            return;
        }

        const url = `https://naver-search-proxy.ehdgus3278.workers.dev/search?q=${encodeURIComponent(keyword)}&display=10&start=1&sort=sim`;

        setStatus('로딩 중...', false);
        searchButton.disabled = true;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const items = Array.isArray(data.items) ? data.items : [];
            latestSearchItems = items;
            setStatus(`${items.length}건의 결과를 찾았습니다.`, false);
            renderResults(items);
        } catch (error) {
            setStatus('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', true);
            searchResults.innerHTML = '';
            latestSearchItems = [];
        } finally {
            searchButton.disabled = false;
        }
    };

    searchButton.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runSearch();
        }
    });

    const extractReadableText = (html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const selectors = [
            '.se-main-container',
            '#postViewArea',
            '.post-view .view',
            '.post_ct',
            'article'
        ];

        const chunks = [];
        selectors.forEach((selector) => {
            doc.querySelectorAll(selector).forEach((node) => {
                const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (text.length > 80) {
                    chunks.push(text);
                }
            });
        });

        if (!chunks.length) {
            const fallback = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
            return fallback;
        }

        return chunks.join(' ');
    };

    const toProxyUrl = (link) => {
        const normalized = link.startsWith('http') ? link : `https://${link}`;
        return `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//, '')}`;
    };

    const fetchBlogBody = async (link) => {
        const targets = [toProxyUrl(link), link];

        for (const target of targets) {
            try {
                const response = await fetch(target);
                if (!response.ok) {
                    continue;
                }
                const text = await response.text();
                const readable = extractReadableText(text);
                if (readable.length > 200) {
                    return readable;
                }
            } catch (error) {
                // try next target
            }
        }

        return '';
    };

    const summarizeBodies = (bodies) => {
        const joined = bodies.join(' ');
        const rawSentences = joined
            .split(/[.!?\n]+/)
            .map((line) => line.trim())
            .filter((line) => line.length >= 18 && line.length <= 140);

        const seen = new Set();
        const unique = [];
        rawSentences.forEach((sentence) => {
            const key = sentence.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(sentence);
            }
        });

        return unique.slice(0, 5);
    };

    const buildDraft = (items, reviewText, keyword, summarySentences) => {
        const topic = keyword || '방문 후기';
        const myReview = reviewText.trim();
        const titleBase = cleanText(items[0]?.title || topic);
        const headline = `${topic} 내돈내산 후기 | ${titleBase}`;

        const introLine = summarySentences.length
            ? `네이버에서 ${topic} 관련 블로그 본문을 여러 개 읽어보니 ${summarySentences[0]} 포인트가 반복적으로 언급됐습니다.`
            : `네이버 블로그 본문을 참고해 ${topic} 관련 핵심 포인트를 먼저 정리했습니다.`;

        const bodyLine = summarySentences.length > 1
            ? `${summarySentences.slice(1, 4).join(', ')} 같은 내용도 공통적으로 확인되어 방문 전에 참고하기 좋았습니다.`
            : `${topic}는 시간대, 메뉴 선택, 동선에 따라 체감이 달라질 수 있다는 점이 공통적으로 보였습니다.`;

        return [
            headline,
            '',
            `${introLine} ${bodyLine}`,
            '',
            `위 내용을 참고해서 직접 다녀온 제 실제 후기는 이렇습니다.`,
            myReview,
            '',
            `결론적으로 검색으로 확인한 정보와 실제 경험을 함께 비교해 보니 ${topic}를 준비할 때 체크해야 할 기준이 더 분명해졌습니다. 저처럼 방문 예정인 분들은 위 포인트를 기준으로 예약 시간과 주문 구성을 잡으면 만족도가 높을 것 같습니다.`,
            '',
            '#네이버블로그 #내돈내산 #방문후기 #리뷰'
        ].join('\n');
    };

    const updateDraft = async () => {
        const reviewText = userReview.value;
        if (!latestSearchItems.length) {
            draftOutput.textContent = '';
            setDraftStatus('먼저 네이버 검색을 실행해 블로그 정보를 불러와 주세요.', true);
            return;
        }
        if (!reviewText.trim()) {
            draftOutput.textContent = '';
            setDraftStatus('내 실제 후기를 입력해야 블로그형 본문으로 생성됩니다.', true);
            return;
        }

        generateButton.disabled = true;
        setDraftStatus('블로그 본문을 읽고 글을 생성하는 중입니다...', false);

        try {
            const candidates = latestSearchItems
                .map((item) => item.link)
                .filter((link) => typeof link === 'string' && link.length > 0)
                .slice(0, 4);

            const bodies = [];
            for (const link of candidates) {
                const body = await fetchBlogBody(link);
                if (body) {
                    bodies.push(body);
                }
            }

            if (!bodies.length) {
                draftOutput.textContent = '';
                setDraftStatus('블로그 본문을 읽어오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
                return;
            }

            const summarySentences = summarizeBodies(bodies);
            const draft = buildDraft(latestSearchItems, reviewText, searchInput.value.trim(), summarySentences);
            draftOutput.textContent = draft;
            setDraftStatus('블로그 본문 기반 후기 글이 생성되었습니다.', false);
        } finally {
            generateButton.disabled = false;
        }
    };

    userReview.value = localStorage.getItem(USER_REVIEW_KEY) || '';
    userReview.addEventListener('input', () => {
        localStorage.setItem(USER_REVIEW_KEY, userReview.value);
    });

    generateButton.addEventListener('click', async () => {
        await updateDraft();
    });

    copyButton.addEventListener('click', async () => {
        const text = draftOutput.textContent.trim();
        if (!text) {
            setDraftStatus('먼저 글을 생성해 주세요.', true);
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setDraftStatus('복사했습니다.', false);
        } catch (error) {
            setDraftStatus('복사에 실패했습니다. 수동으로 복사해 주세요.', true);
        }
    });

    const reviews = JSON.parse(localStorage.getItem('reviews')) || [];

    reviews.forEach(reviewData => {
        const reviewCard = document.createElement('review-card');
        reviewCard.review = reviewData;
        reviewsContainer.appendChild(reviewCard);
    });

    reviewForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const blogUrl = document.getElementById('blog-url').value;
        const rating = document.getElementById('rating').value;
        const reviewText = document.getElementById('review-text').value;

        const newReview = {
            url: blogUrl,
            rating: rating,
            text: reviewText
        };

        const reviewCard = document.createElement('review-card');
        reviewCard.review = newReview;
        reviewsContainer.appendChild(reviewCard);

        reviews.push(newReview);
        localStorage.setItem('reviews', JSON.stringify(reviews));

        reviewForm.reset();
    });
});
