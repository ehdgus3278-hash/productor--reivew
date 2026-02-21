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
    const reviewForm = document.getElementById('review-form');
    const reviewsContainer = document.getElementById('reviews-container');

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

    const runSearch = async () => {
        const keyword = searchInput.value.trim();
        if (!keyword) {
            setStatus('검색어를 입력해 주세요.', true);
            searchResults.innerHTML = '';
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
            setStatus(`${items.length}건의 결과를 찾았습니다.`, false);
            renderResults(items);
        } catch (error) {
            setStatus('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', true);
            searchResults.innerHTML = '';
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
