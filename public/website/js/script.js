document.addEventListener("DOMContentLoaded", function () {

  var toggle = document.querySelector(".nav-toggle");
  var navList = document.querySelector(".nav-list");

  if (toggle && navList) {
    toggle.addEventListener("click", function () {
      var isOpen = navList.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  var form = document.querySelector(".contact-form");
  var successMessage = document.querySelector(".form-success");

  if (form && successMessage) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      form.reset();
      successMessage.classList.add("is-visible");
      successMessage.setAttribute("role", "status");
    });
  }

  // ===== Property image sliders =====
  var sliders = document.querySelectorAll("[data-slider]");

  sliders.forEach(function (slider) {
    var slides = slider.querySelectorAll(".property-slide");
    var dots = slider.querySelectorAll(".slider-dot");
    var prevButton = slider.querySelector(".slider-prev");
    var nextButton = slider.querySelector(".slider-next");

    var currentSlide = 0;
    var autoSlideTimer = null;

    function showSlide(index) {
      if (index < 0) {
        index = slides.length - 1;
      }

      if (index >= slides.length) {
        index = 0;
      }

      slides.forEach(function (slide) {
        slide.classList.remove("is-active");
      });

      dots.forEach(function (dot) {
        dot.classList.remove("is-active");
      });

      slides[index].classList.add("is-active");

      if (dots[index]) {
        dots[index].classList.add("is-active");
      }

      currentSlide = index;
    }

    function nextSlide() {
      showSlide(currentSlide + 1);
    }

    function previousSlide() {
      showSlide(currentSlide - 1);
    }

    function startAutoSlide() {
      stopAutoSlide();

      autoSlideTimer = setInterval(function () {
        nextSlide();
      }, 4500);
    }

    function stopAutoSlide() {
      if (autoSlideTimer) {
        clearInterval(autoSlideTimer);
        autoSlideTimer = null;
      }
    }

    if (nextButton) {
      nextButton.addEventListener("click", function () {
        nextSlide();
        startAutoSlide();
      });
    }

    if (prevButton) {
      prevButton.addEventListener("click", function () {
        previousSlide();
        startAutoSlide();
      });
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        var index = Number(dot.getAttribute("data-slide"));
        showSlide(index);
        startAutoSlide();
      });
    });

    startAutoSlide();
  });

});