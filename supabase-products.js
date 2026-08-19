/*
  ALPONA SUPABASE PRODUCTS
  Put this file AFTER image-upload-patch.js in index.html
*/

(function () {

  const BUCKET = "product-images";


  // -----------------------------------
  // Convert Supabase product to the
  // format your old website understands
  // -----------------------------------

  function convertProduct(p) {

    return {
      id: Number(p.id),
      name: p.name,
      category: p.category || "",
      description: p.description || "",
      price: Number(p.price || 0),
      cost: Number(p.cost || 0),
      stock: Number(p.stock || 0),
      weight_kg: Number(p.weight_kg || 0.5),

      // Your old website expects "image"
      image: p.image_url || "assets/logo.jpeg",

      active: p.active !== false
    };

  }


  // -----------------------------------
  // Save Supabase products into your
  // existing local cache
  // -----------------------------------

  function saveProductCache(rows) {

    const converted =
      (rows || []).map(convertProduct);

    localStorage.setItem(
      "alpona_products",
      JSON.stringify(converted)
    );

    return converted;

  }


  // -----------------------------------
  // Load products from Supabase
  // -----------------------------------

  async function loadSupabaseProducts() {

    const { data, error } = await db
      .from("products")
      .select("*")
      .order("id", { ascending: true });

    if (error) {

      console.error(
        "Could not load Supabase products:",
        error
      );

      return null;
    }

    return data || [];

  }


  async function refreshSupabaseProducts() {

    const rows =
      await loadSupabaseProducts();

    if (rows === null) return;

    /*
      IMPORTANT:
      If database is still empty,
      don't remove your current products.
    */

    if (rows.length === 0) return;

    saveProductCache(rows);

    renderProducts();

    renderAdminProducts(rows);

  }


  // -----------------------------------
  // Owner Products table
  // -----------------------------------

  function renderAdminProducts(rows) {

    const container =
      document.getElementById("adminProducts");

    if (!container) return;

    if (!rows || !rows.length) {

      container.innerHTML =
        "<p>No products yet.</p>";

      return;
    }


    container.innerHTML = `

      <table class="adminTable">

        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Stock</th>
          <th></th>
        </tr>

        ${rows.map(p => `

          <tr>

            <td>

              <b>${p.name}</b>

              <br>

              <span class="muted">
                ${p.category || ""}
              </span>

            </td>

            <td>
              ${money(p.price)}
            </td>

            <td>
              ${money(p.cost)}
            </td>

            <td>
              ${p.stock}
            </td>

            <td>

              <button
                class="secondary"
                onclick="openProductForm(${p.id})"
              >
                Edit
              </button>

              <button
                class="danger"
                onclick="deleteProduct(${p.id})"
              >
                Delete
              </button>

            </td>

          </tr>

        `).join("")}

      </table>
    `;

  }


  // -----------------------------------
  // Import your existing products once
  // if Supabase products table is empty
  // -----------------------------------

  async function importExistingProducts() {

    const rows =
      await loadSupabaseProducts();

    if (rows === null) return;

    if (rows.length > 0) {

      saveProductCache(rows);

      renderProducts();

      renderAdminProducts(rows);

      return;
    }


    const existingProducts =
      products();


    if (!existingProducts.length) return;


    const records =
      existingProducts.map(p => ({

        id: Number(p.id),

        name: p.name,

        category: p.category || "",

        description:
          p.description || "",

        price:
          Number(p.price || 0),

        cost:
          Number(p.cost || 0),

        stock:
          Number(p.stock || 0),

        image_url:
          p.image || "assets/logo.jpeg",

        active: true

      }));


    const { error } = await db
      .from("products")
      .insert(records);


    if (error) {

      console.error(
        "Product import error:",
        error
      );

      alert(
        "Could not import your existing products into Supabase."
      );

      return;
    }


    console.log(
      "Existing Alpona products imported to Supabase."
    );


    await refreshSupabaseProducts();

  }



  // -----------------------------------
  // Add real image uploader
  // -----------------------------------

  function ensureSupabaseUploader() {

    const form =
      document.getElementById("productForm");

    if (!form) return;


    /*
      Your image-upload-patch already
      creates this input.
    */

    if (
      document.getElementById(
        "alponaPhotoUpload"
      )
    ) {

      return;
    }


    const imageField =
      form.elements["image"];


    if (!imageField) return;


    const label =
      imageField.closest("label");


    if (!label) return;


    imageField.style.display =
      "none";


    const holder =
      document.createElement("div");


    holder.innerHTML = `

      <input
        id="alponaPhotoUpload"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style="
          width:100%;
          padding:10px;
          border:1px solid #d7c7b2;
          background:white;
          margin-top:8px;
        "
      >

      <div
        style="
          font:11px Arial;
          color:#74685f;
          margin-top:6px;
        "
      >
        Upload JPG, PNG or WEBP
      </div>

      <div
        id="supabaseImagePreviewWrap"
        style="
          display:none;
          margin-top:10px;
        "
      >

        <img
          id="supabaseImagePreview"
          style="
            width:130px;
            height:130px;
            object-fit:cover;
            border:1px solid #ddd;
          "
        >

      </div>

    `;


    label.appendChild(holder);


    document
      .getElementById(
        "alponaPhotoUpload"
      )
      .addEventListener(
        "change",
        function () {

          const file =
            this.files &&
            this.files[0];


          if (!file) return;


          const preview =
            document.getElementById(
              "supabaseImagePreview"
            );


          const wrap =
            document.getElementById(
              "supabaseImagePreviewWrap"
            );


          if (
            preview &&
            wrap
          ) {

            preview.src =
              URL.createObjectURL(file);

            wrap.style.display =
              "block";

          }

        }
      );

  }



  // -----------------------------------
  // Upload image to Supabase Storage
  // -----------------------------------

  async function uploadProductImage(file) {

    if (!file) return null;


    const extension =
      file.name
        .split(".")
        .pop()
        .toLowerCase();


    const safeName =
      file.name
        .replace(
          /[^a-zA-Z0-9._-]/g,
          "-"
        );


    const path =
      "products/" +
      Date.now() +
      "-" +
      safeName;


    const { error } =
      await db.storage
        .from(BUCKET)
        .upload(
          path,
          file,
          {
            cacheControl: "3600",
            upsert: false
          }
        );


    if (error) {

      console.error(
        "Image upload error:",
        error
      );

      throw new Error(
        "Could not upload image."
      );

    }


    const { data } =
      db.storage
        .from(BUCKET)
        .getPublicUrl(path);


    return {
      url: data.publicUrl,
      path: path
    };

  }



  // -----------------------------------
  // Edit / Add Product
  // -----------------------------------

  const oldOpenProductForm =
    window.openProductForm;


  window.openProductForm =
    function (id) {

      oldOpenProductForm(id);

      ensureSupabaseUploader();


      const uploader =
        document.getElementById(
          "alponaPhotoUpload"
        );


      if (uploader) {

        uploader.value = "";

      }

  };



  // -----------------------------------
  // SAVE PRODUCT TO SUPABASE
  // -----------------------------------

  window.saveProduct =
    async function (event) {

      event.preventDefault();


      const form =
        event.target;


      const fd =
        new FormData(form);


      const id =
        Number(fd.get("id")) || null;


      const uploader =
        document.getElementById(
          "alponaPhotoUpload"
        );


      const file =
        uploader &&
        uploader.files
          ? uploader.files[0]
          : null;


      let imageUrl = null;


      /*
        If editing, keep current image
        unless owner uploads a new one.
      */

      if (id) {

        const cached =
          products()
            .find(
              p => p.id === id
            );


        if (cached) {

          imageUrl =
            cached.image;

        }

      }


      try {

        if (file) {

          const upload =
            await uploadProductImage(
              file
            );


          imageUrl =
            upload.url;

        }


        const record = {

          name:
            fd.get("name"),

          category:
            fd.get("category"),

          description:
            fd.get("description"),

          price:
            Number(
              fd.get("price")
            ),

          cost:
            Number(
              fd.get("cost")
            ),

          stock:
            Number(
              fd.get("stock")
            ),
weight_kg:
  Math.max(
    0.5,
    Number(
      fd.get("weight_kg") || 0.5
    )
  ),
          image_url:
            imageUrl ||
            "assets/logo.jpeg",

          active: true

        };


        let error;


        if (id) {

          const result =
            await db
              .from("products")
              .update(record)
              .eq("id", id);


          error =
            result.error;

        } else {

          const result =
            await db
              .from("products")
              .insert(record);


          error =
            result.error;

        }


        if (error) {

          console.error(
            "Product save error:",
            error
          );

          alert(
            "Could not save the product."
          );

          return;

        }


        closeModal(
          "productFormModal"
        );


        toast(
          "Product saved"
        );


        await refreshSupabaseProducts();


      } catch (error) {

        console.error(error);

        alert(
          error.message ||
          "Could not save product."
        );

      }

  };



  // -----------------------------------
  // DELETE PRODUCT FROM SUPABASE
  // -----------------------------------

  window.deleteProduct =
    async function (id) {

      if (
        !confirm(
          "Delete this product?"
        )
      ) {

        return;

      }


      const { error } =
        await db
          .from("products")
          .delete()
          .eq("id", id);


      if (error) {

        console.error(error);

        alert(
          "Could not delete product."
        );

        return;

      }


      toast(
        "Product deleted"
      );


      await refreshSupabaseProducts();

  };



  // -----------------------------------
  // When Owner Dashboard opens
  // -----------------------------------

  const previousOpenAdmin =
    window.openAdmin;


  window.openAdmin =
    function () {

      previousOpenAdmin();

      /*
        If Supabase is empty,
        copy your current website
        products there one time.
      */

      setTimeout(
        importExistingProducts,
        300
      );

  };



  // -----------------------------------
  // Public storefront load
  // -----------------------------------

  async function startProducts() {

    await refreshSupabaseProducts();

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      startProducts
    );

  } else {

    startProducts();

  }

})();
