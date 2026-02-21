class ReviewCard extends HTMLElement {
    constructor() {
        super();d
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
    const reviewForm = document.getElementById('review-form');
    const reviewsContainer = document.getElementById('reviews-container');

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
