/*
  ALPONA IMAGE UPLOAD PATCH
  Adds image upload to Add/Edit Product.
  Works with the current Alpona prototype.
*/

(function () {

  let uploadedImage = "";

  function addUploadOption() {

    const form = document.getElementById("productForm");

    if (!form) return;

    const imageSelect = form.elements["image"];

    if (!imageSelect) return;

    const label = imageSelect.closest("label");

    if (!label) return;

    // Prevent adding the uploader twice
    if (label.dataset.alponaUpload === "yes") return;

    label.dataset.alponaUpload = "yes";

    // Hide old image dropdown
    imageSelect.style.display = "none";

    const uploadArea = document.createElement("div");

    uploadArea.innerHTML = `
      <div style="margin-top:8px;">

        <input
          id="alponaPhotoUpload"
          type="file"
          accept="image/*"
          style="
            width:100%;
            padding:12px;
            border:1px solid #d7c7b2;
            background:white;
            box-sizing:border-box;
          "
        >

        <div
          style="
            font-size:12px;
            margin-top:6px;
            color:#6f6259;
          "
        >
          Upload a JPG, PNG or WEBP product photo.
        </div>

        <div
          id="alponaPhotoPreviewArea"
          style="
            display:none;
            margin-top:12px;
          "
        >

          <div style="font-size:12px;margin-bottom:6px;">
            New Photo Preview
          </div>

          <img
            id="alponaPhotoPreview"
            alt="Product image preview"
            style="
              width:130px;
              height:130px;
              object-fit:cover;
              border:1px solid #ddd;
              border-radius:4px;
            "
          >

        </div>

      </div>
    `;

    label.appendChild(uploadArea);

    const uploader =
      document.getElementById("alponaPhotoUpload");

    uploader.addEventListener("change", function () {

      const file = this.files && this.files[0];

      if (!file) {
        uploadedImage = "";
        return;
      }

      if (!file.type.startsWith("image/")) {

        alert("Please select an image.");

        this.value = "";

        return;
      }

      if (file.size > 2 * 1024 * 1024) {

        alert(
          "This image is too large. Please use an image smaller than 2 MB."
        );

        this.value = "";

        return;
      }

      const reader = new FileReader();

      reader.onload = function (event) {

        uploadedImage = event.target.result;

        const preview =
          document.getElementById("alponaPhotoPreview");

        preview.src = uploadedImage;

        document.getElementById(
          "alponaPhotoPreviewArea"
        ).style.display = "block";

      };

      reader.readAsDataURL(file);

    });

  }


  /*
    Run uploader when page loads
  */

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      addUploadOption
    );

  } else {

    addUploadOption();

  }


  /*
    Run uploader whenever Add/Edit Product opens
  */

  const originalOpenProductForm =
    window.openProductForm;

  if (typeof originalOpenProductForm === "function") {

    window.openProductForm = function (id) {

      uploadedImage = "";

      originalOpenProductForm(id);

      addUploadOption();

      const uploader =
        document.getElementById("alponaPhotoUpload");

      if (uploader) {
        uploader.value = "";
      }

      const preview =
        document.getElementById(
          "alponaPhotoPreviewArea"
        );

      if (preview) {
        preview.style.display = "none";
      }

    };

  }


  /*
    Replace Save Product so uploaded image
    can be stored with the product.
  */

  window.saveProduct = function (event) {

    event.preventDefault();

    const form = event.target;

    const data = new FormData(form);

    const productList = products();

    const existingId =
      Number(data.get("id"));

    const id =
      existingId || Date.now();

    const existingProduct =
      existingId
        ? productList.find(
            product => product.id === existingId
          )
        : null;


    /*
      Uploaded photo has first priority.

      If no new photo was uploaded,
      keep the existing product photo.
    */

    const image =
      uploadedImage ||
      (existingProduct &&
        existingProduct.image) ||
      data.get("image") ||
      "assets/logo.jpeg";


    const product = {

      id: id,

      name: data.get("name"),

      category:
        data.get("category"),

      price:
        Number(data.get("price")),

      cost:
        Number(data.get("cost")),

      stock:
        Number(data.get("stock")),

      image: image,

      description:
        data.get("description")

    };


    const existingIndex =
      productList.findIndex(
        item => item.id === id
      );


    if (existingIndex >= 0) {

      productList[existingIndex] =
        product;

    } else {

      productList.push(product);

    }


    try {

      set(
        "alpona_products",
        productList
      );

    } catch (error) {

      alert(
        "The photo could not be saved. Please try a smaller image."
      );

      return;

    }


    uploadedImage = "";

    closeModal(
      "productFormModal"
    );

    renderProducts();

    renderAdmin();

    toast(
      "Product saved with photo"
    );

  };

})();
