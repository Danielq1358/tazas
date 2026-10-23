(() => {
  "use strict";

  const entryScreen = document.querySelector("#entry-screen");
  const entryForm = document.querySelector("#entry-form");
  const entryError = document.querySelector("#entry-error");
  const storefront = document.querySelector("#storefront");
  const ENTRY_SESSION_KEY = "tazita-studio-entry-complete";
  const PROFILE_STORAGE_KEY = "tazita-studio-customer-profile-v1";
  const welcomeMessage = document.querySelector("#welcome-message");
  let userProfile = null;

  function showEntryError(message) {
    entryError.textContent = message;
    entryError.hidden = false;
  }

  function getWelcomeGreeting(profile) {
    const firstName = profile.firstName;
    if (profile.gender === "mujer") return `¡Bienvenida, ${firstName}!`;
    if (profile.gender === "hombre") return `¡Bienvenido, ${firstName}!`;
    return `¡Te damos la bienvenida, ${firstName}!`;
  }

  function updateWelcomeMessage() {
    if (!userProfile) return;
    welcomeMessage.textContent = getWelcomeGreeting(userProfile);
    welcomeMessage.hidden = false;
  }

  try {
    const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      if (
        profile &&
        typeof profile.firstName === "string" &&
        profile.firstName.trim().length > 0 &&
        typeof profile.lastName === "string" &&
        profile.lastName.trim().length > 0 &&
        typeof profile.age === "number" &&
        Number.isInteger(profile.age) &&
        profile.age >= 1 &&
        profile.age <= 120 &&
        ["mujer", "hombre", "otro", "prefiero-no-decir"].includes(profile.gender)
      ) {
        userProfile = profile;
        entryForm.elements.firstName.value = profile.firstName;
        entryForm.elements.lastName.value = profile.lastName;
        entryForm.elements.age.value = String(profile.age);
        entryForm.elements.gender.value = profile.gender;
        updateWelcomeMessage();
      } else {
        throw new TypeError("El perfil guardado no tiene un formato válido.");
      }
    }
  } catch (error) {
    console.error("No se pudo cargar el perfil guardado.", error);
    showEntryError("No se pudieron cargar tus datos guardados. Puedes revisarlos y volver a guardar el registro.");
  }

  function enterStorefront() {
    entryScreen.hidden = true;
    storefront.hidden = false;
  }

  try {
    if (sessionStorage.getItem(ENTRY_SESSION_KEY) === "true") enterStorefront();
  } catch (error) {
    console.error("No se pudo comprobar la sesión de entrada.", error);
  }

  entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!entryForm.reportValidity()) return;

    const age = Number(entryForm.elements.age.value);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      entryForm.elements.age.setCustomValidity("Ingresa una edad válida.");
      entryForm.elements.age.reportValidity();
      return;
    }

    entryForm.elements.age.setCustomValidity("");
    const profile = {
      firstName: entryForm.elements.firstName.value.trim(),
      lastName: entryForm.elements.lastName.value.trim(),
      age,
      gender: entryForm.elements.gender.value
    };
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error("No se pudo guardar el perfil.", error);
      showEntryError("No se pudieron guardar tus datos en este navegador. Revisa el almacenamiento disponible e inténtalo de nuevo.");
      return;
    }

    userProfile = profile;
    updateWelcomeMessage();
    try {
      sessionStorage.setItem(ENTRY_SESSION_KEY, "true");
    } catch (error) {
      console.error("No se pudo recordar el acceso durante esta sesión.", error);
    }
    entryError.hidden = true;
    enterStorefront();
  });

  const STORAGE_KEY = "tazita-studio-orders-v1";
  const DESIGN_STORAGE_KEY = "tazita-studio-design-v1";
  const canvas = document.querySelector("#design-canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const eraserCursor = document.querySelector("#eraser-cursor");
  const brushSizeInput = document.querySelector("#brush-size");
  const undoButton = document.querySelector("#undo-design");
  const redoButton = document.querySelector("#redo-design");
  const imageSizeInput = document.querySelector("#image-size");
  const imageSizeControl = document.querySelector("#image-size-control");
  const form = document.querySelector("#order-form");
  const inboxDialog = document.querySelector("#inbox-dialog");
  const DESIGN_HISTORY_LIMIT = 30;
  let designHistory = [];
  let historyIndex = -1;
  let selectedImage = null;
  let activeTool = "brush";
  let drawing = false;
  let lastPoint = null;
  let lineStart = null;
  let lineSnapshot = null;
  let placingText = false;
  let lastPointerPosition = null;
  let pointerInsideCanvas = false;
  let toastTimer;

  canvas.dataset.tool = activeTool;
  canvas.dataset.placeText = "false";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  designHistory.push(context.getImageData(0, 0, canvas.width, canvas.height));
  historyIndex = 0;

  function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= designHistory.length - 1;
  }

  function recordDesignState() {
    designHistory = designHistory.slice(0, historyIndex + 1);
    designHistory.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (designHistory.length > DESIGN_HISTORY_LIMIT) designHistory.shift();
    historyIndex = designHistory.length - 1;
    updateHistoryButtons();
  }

  function clearImageSelection() {
    selectedImage = null;
    imageSizeControl.hidden = true;
  }

  function applyHistoryState(index) {
    if (index < 0 || index >= designHistory.length || index === historyIndex) return;
    clearImageSelection();
    historyIndex = index;
    context.putImageData(designHistory[historyIndex], 0, 0);
    updateHistoryButtons();
    saveDesign();
  }

  undoButton.addEventListener("click", () => applyHistoryState(historyIndex - 1));
  redoButton.addEventListener("click", () => applyHistoryState(historyIndex + 1));
  updateHistoryButtons();

  function saveDesign() {
    try {
      localStorage.setItem(DESIGN_STORAGE_KEY, canvas.toDataURL("image/png"));
      return true;
    } catch (error) {
      console.error("No se pudo guardar el diseño automáticamente.", error);
      showToast("No se pudo guardar el diseño en este navegador. Descárgalo para conservar una copia.");
      return false;
    }
  }

  function restoreSavedDesign() {
    try {
      const savedDesign = localStorage.getItem(DESIGN_STORAGE_KEY);
      if (!savedDesign) return;
      const image = new Image();
      image.addEventListener("load", () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        designHistory = [context.getImageData(0, 0, canvas.width, canvas.height)];
        historyIndex = 0;
        updateHistoryButtons();
      });
      image.addEventListener("error", () => {
        console.error("No se pudo recuperar el diseño guardado: la imagen no es válida.");
        showToast("No se pudo recuperar el diseño guardado en este navegador.");
      });
      image.src = savedDesign;
    } catch (error) {
      console.error("No se pudo leer el diseño guardado.", error);
      showToast("No se pudo recuperar el diseño guardado en este navegador.");
    }
  }

  restoreSavedDesign();

  function showToast(message) {
    const toast = document.querySelector("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  document.querySelector("#logout-button").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(ENTRY_SESSION_KEY);
    } catch (error) {
      console.error("No se pudo cerrar la sesión de la tienda.", error);
      showToast("No se pudo cerrar la sesión en este navegador.");
      return;
    }
    storefront.hidden = true;
    entryScreen.hidden = false;
    entryError.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
    entryForm.elements.firstName.focus();
  });

  function getOrders() {
    try {
      const orders = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(orders) ? orders : [];
    } catch (error) {
      console.error("No se pudieron leer los pedidos guardados.", error);
      showToast("No se pudieron cargar los pedidos guardados en este navegador.");
      return [];
    }
  }

  function saveOrders(orders) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      return true;
    } catch (error) {
      console.error("No se pudo guardar el pedido en el navegador.", error);
      showToast("No se pudo guardar el pedido. Puede que el almacenamiento esté lleno.");
      return false;
    }
  }

  function getCanvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * (canvas.width / bounds.width))),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * (canvas.height / bounds.height)))
    };
  }

  function updateEraserCursor(event) {
    if (event) lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
    if (!event || !pointerInsideCanvas || activeTool !== "eraser" || placingText) {
      eraserCursor.hidden = true;
      return;
    }
    const canvasBounds = canvas.getBoundingClientRect();
    const frameBounds = canvas.parentElement.getBoundingClientRect();
    const diameter = Number(brushSizeInput.value) * (canvasBounds.width / canvas.width);
    eraserCursor.style.width = `${diameter}px`;
    eraserCursor.style.height = `${diameter}px`;
    eraserCursor.style.left = `${event.clientX - frameBounds.left}px`;
    eraserCursor.style.top = `${event.clientY - frameBounds.top}px`;
    eraserCursor.hidden = false;
  }

  function drawSegment(from, to, color, width) {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  }

  function fillArea(point) {
    const x = Math.min(canvas.width - 1, Math.floor(point.x));
    const y = Math.min(canvas.height - 1, Math.floor(point.y));
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const start = (y * canvas.width + x) * 4;
    const target = [pixels[start], pixels[start + 1], pixels[start + 2]];
    const fillColor = document.querySelector("#brush-color").value;
    const fill = [1, 3, 5].map((offset) => Number.parseInt(fillColor.slice(offset, offset + 2), 16));
    if (target.every((channel, index) => Math.abs(channel - fill[index]) < 4)) return false;

    const pixelCount = canvas.width * canvas.height;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    const tolerance = 28;
    let head = 0;
    let tail = 0;
    const seed = y * canvas.width + x;
    queue[tail++] = seed;
    visited[seed] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const offset = pixel * 4;
      const matches = Math.abs(pixels[offset] - target[0]) <= tolerance &&
        Math.abs(pixels[offset + 1] - target[1]) <= tolerance &&
        Math.abs(pixels[offset + 2] - target[2]) <= tolerance;
      if (!matches) continue;
      pixels[offset] = fill[0];
      pixels[offset + 1] = fill[1];
      pixels[offset + 2] = fill[2];
      pixels[offset + 3] = 255;

      const column = pixel % canvas.width;
      const neighbors = [];
      if (column > 0) neighbors.push(pixel - 1);
      if (column < canvas.width - 1) neighbors.push(pixel + 1);
      if (pixel >= canvas.width) neighbors.push(pixel - canvas.width);
      if (pixel < pixelCount - canvas.width) neighbors.push(pixel + canvas.width);
      for (const neighbor of neighbors) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    context.putImageData(image, 0, 0);
    return true;
  }

  function placeText(point) {
    const text = document.querySelector("#canvas-text").value.trim();
    if (!text) return;
    const color = document.querySelector("#brush-color").value;
    const selectedSize = Number(document.querySelector("#text-size").value);
    const vertical = document.querySelector("#vertical-text").checked;
    const maxWidth = canvas.width - 24;
    context.save();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    let fontSize = selectedSize;
    let lines;

    if (vertical) {
      const characters = Array.from(text);
      fontSize = Math.min(fontSize, (canvas.height - 24) / Math.max(1, characters.length) / 1.2);
      context.font = `bold ${fontSize}px 'DM Sans', sans-serif`;
      const lineHeight = fontSize * 1.2;
      const centerY = Math.max(lineHeight * characters.length / 2 + 12, Math.min(canvas.height - lineHeight * characters.length / 2 - 12, point.y));
      const centerX = Math.max(fontSize / 2 + 12, Math.min(canvas.width - fontSize / 2 - 12, point.x));
      characters.forEach((character, index) => context.fillText(character, centerX, centerY - (characters.length - 1) * lineHeight / 2 + index * lineHeight));
    } else {
      const wrapText = () => {
        context.font = `bold ${fontSize}px 'DM Sans', sans-serif`;
        lines = [];
        let line = "";
        for (const word of text.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (context.measureText(candidate).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) lines.push(line);
      };
      wrapText();
      fontSize = Math.min(fontSize, (canvas.height - 24) / Math.max(1, lines.length) / 1.2);
      wrapText();
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const widestLine = Math.min(maxWidth, Math.max(...lines.map((line) => context.measureText(line).width)));
      const centerX = Math.max(widestLine / 2 + 12, Math.min(canvas.width - widestLine / 2 - 12, point.x));
      const centerY = Math.max(totalHeight / 2 + 12, Math.min(canvas.height - totalHeight / 2 - 12, point.y));
      lines.forEach((line, index) => context.fillText(line, centerX, centerY - (lines.length - 1) * lineHeight / 2 + index * lineHeight, maxWidth));
    }
    context.restore();
    placingText = false;
    canvas.dataset.placeText = "false";
    recordDesignState();
    saveDesign();
    document.querySelector("#canvas-status").textContent = "Texto colocado en el diseño.";
  }

  document.querySelectorAll("[data-draw-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTool = button.dataset.drawTool;
      placingText = false;
      canvas.dataset.tool = activeTool;
      canvas.dataset.placeText = "false";
      document.querySelector("#brush-size-label").textContent = activeTool === "eraser" ? "Borrar" : "Trazo";
      brushSizeInput.setAttribute("aria-label", activeTool === "eraser" ? "Tamaño del borrador" : "Tamaño del trazo");
      if (activeTool === "eraser") updateEraserCursor(lastPointerPosition);
      else eraserCursor.hidden = true;
      document.querySelectorAll("[data-draw-tool]").forEach((toolButton) => {
        toolButton.setAttribute("aria-pressed", String(toolButton === button));
      });
      const labels = { brush: "Pincel seleccionado.", line: "Línea seleccionada: arrastra para trazarla.", fill: "Relleno seleccionado: pulsa una zona cerrada.", eraser: "Borrador seleccionado: ajusta el tamaño y borra con el mouse o el dedo." };
      document.querySelector("#canvas-status").textContent = labels[activeTool];
    });
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointerInsideCanvas = true;
    updateEraserCursor(event);
    const point = getCanvasPoint(event);
    if (placingText) {
      placeText(point);
      return;
    }
    clearImageSelection();
    if (activeTool === "fill") {
      if (fillArea(point)) {
        recordDesignState();
        saveDesign();
      }
      return;
    }

    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    lastPoint = point;
    const color = activeTool === "eraser" ? "#ffffff" : document.querySelector("#brush-color").value;
    const width = Number(document.querySelector("#brush-size").value);
    if (activeTool === "line") {
      lineStart = point;
      lineSnapshot = context.getImageData(0, 0, canvas.width, canvas.height);
      drawSegment(lineStart, point, color, width);
    } else {
      drawSegment(point, { x: point.x + 0.1, y: point.y + 0.1 }, color, width);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    pointerInsideCanvas = true;
    updateEraserCursor(event);
    if (!drawing) return;
    const point = getCanvasPoint(event);
    const color = activeTool === "eraser" ? "#ffffff" : document.querySelector("#brush-color").value;
    const width = Number(document.querySelector("#brush-size").value);
    if (activeTool === "line") {
      context.putImageData(lineSnapshot, 0, 0);
      drawSegment(lineStart, point, color, width);
    } else {
      drawSegment(lastPoint, point, color, width);
      lastPoint = point;
    }
  });

  function stopDrawing(event) {
    if (!drawing) return false;
    if (activeTool === "line") {
      const point = getCanvasPoint(event);
      context.putImageData(lineSnapshot, 0, 0);
      drawSegment(lineStart, point, document.querySelector("#brush-color").value, Number(document.querySelector("#brush-size").value));
    }
    drawing = false;
    lastPoint = null;
    lineStart = null;
    lineSnapshot = null;
    return true;
  }

  function cancelDrawing() {
    const changed = drawing && activeTool !== "line";
    if (drawing && activeTool === "line" && lineSnapshot) context.putImageData(lineSnapshot, 0, 0);
    drawing = false;
    lastPoint = null;
    lineStart = null;
    lineSnapshot = null;
    return changed;
  }

  canvas.addEventListener("pointerup", (event) => {
    if (stopDrawing(event)) {
      recordDesignState();
      saveDesign();
    }
  });
  canvas.addEventListener("pointercancel", () => {
    if (cancelDrawing()) {
      recordDesignState();
      saveDesign();
    }
  });
  canvas.addEventListener("lostpointercapture", cancelDrawing);
  canvas.addEventListener("pointerleave", () => {
    pointerInsideCanvas = false;
    if (!drawing) eraserCursor.hidden = true;
  });
  canvas.addEventListener("pointerenter", (event) => {
    pointerInsideCanvas = true;
    updateEraserCursor(event);
  });
  brushSizeInput.addEventListener("input", () => updateEraserCursor(lastPointerPosition));

  document.querySelector("#clear-canvas").addEventListener("click", () => {
    clearImageSelection();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    recordDesignState();
    saveDesign();
    placingText = false;
    canvas.dataset.placeText = "false";
    document.querySelector("#canvas-status").textContent = "Lienzo limpio. Elige una herramienta para empezar.";
  });

  document.querySelector("#add-text").addEventListener("click", () => {
    const text = document.querySelector("#canvas-text").value.trim();
    if (!text) {
      document.querySelector("#canvas-text").focus();
      document.querySelector("#canvas-status").textContent = "Escribe el texto que quieres colocar.";
      return;
    }
    placingText = true;
    clearImageSelection();
    eraserCursor.hidden = true;
    canvas.dataset.placeText = "true";
    document.querySelector("#canvas-status").textContent = "Pulsa o toca el lugar del lienzo donde quieres colocar el texto.";
  });

  document.querySelector("#image-upload").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Elige un archivo de imagen para agregarlo al diseño.");
      event.target.value = "";
      return;
    }
    clearImageSelection();
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        const fitScale = Math.min((canvas.width * 0.7) / image.width, (canvas.height * 0.7) / image.height, 1);
        const maxScale = Math.min(canvas.width / image.width, canvas.height / image.height);
        selectedImage = {
          image,
          base: context.getImageData(0, 0, canvas.width, canvas.height),
          fitScale,
          maxScale
        };
        imageSizeInput.value = "100";
        imageSizeInput.max = String(Math.ceil((maxScale / fitScale) * 100));
        imageSizeControl.hidden = false;
        renderSelectedImage();
        recordDesignState();
        if (saveDesign()) showToast("Imagen agregada y diseño guardado automáticamente en este navegador.");
      });
      image.addEventListener("error", () => showToast("No se pudo abrir esa imagen."));
      image.src = String(reader.result);
    });
    reader.addEventListener("error", () => showToast("No se pudo leer ese archivo."));
    reader.readAsDataURL(file);
    event.target.value = "";
  });

  function renderSelectedImage() {
    if (!selectedImage) return;
    context.putImageData(selectedImage.base, 0, 0);
    const scale = Math.min(
      selectedImage.fitScale * Number(imageSizeInput.value) / 100,
      selectedImage.maxScale
    );
    const width = selectedImage.image.width * scale;
    const height = selectedImage.image.height * scale;
    context.drawImage(selectedImage.image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  imageSizeInput.addEventListener("input", renderSelectedImage);
  imageSizeInput.addEventListener("change", () => {
    if (!selectedImage) return;
    recordDesignState();
    if (saveDesign()) showToast("Tamaño de imagen actualizado y guardado.");
  });

  document.querySelector("#download-design").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "mi-diseno-tazita-studio.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function statusLabel(status) {
    return { pending: "Pendiente", accepted: "Aceptado", rejected: "Rechazado" }[status] || "Pendiente";
  }

  function renderOrders() {
    const orders = getOrders();
    const orderList = document.querySelector("#order-list");
    document.querySelector("#inbox-count").textContent = String(orders.length);
    document.querySelector("#empty-inbox").hidden = orders.length > 0;
    orderList.innerHTML = orders.map((order) => `
      <article class="order-item" data-order-id="${escapeHtml(order.id)}">
        <div class="order-item-head">
          <div><h3>${escapeHtml(order.name)}</h3><div class="order-meta">${escapeHtml(order.quantity)} taza(s) · Productos ${escapeHtml(order.price || "Precio pendiente")} · ${order.fulfillmentMethod === "pickup" ? "Retiro · sin costo de envío" : `Envío ${escapeHtml(order.deliveryPrice || "por confirmar")}`} · Total ${escapeHtml(order.totalPrice || order.price || "pendiente")} · ${escapeHtml(order.email)}${order.phone ? ` · ${escapeHtml(order.phone)}` : ""}</div></div>
          <span class="status-badge status-${escapeHtml(order.status)}">${statusLabel(order.status)}</span>
        </div>
        ${order.fulfillmentMethod === "pickup" ? `<p class="order-message">Modalidad: Retiro (coordinar punto de entrega).</p>` : ""}
        ${order.deliveryAddress ? `<p class="order-message">Dirección de entrega: ${escapeHtml(order.deliveryAddress)}</p>` : ""}
        ${order.message ? `<p class="order-message">${escapeHtml(order.message)}</p>` : ""}
        ${order.design ? `<img class="order-design" src="${order.design}" alt="Diseño adjunto por ${escapeHtml(order.name)}">` : ""}
        <div class="order-actions">
          <button class="order-action" type="button" data-status="accepted">Aceptar</button>
          <button class="order-action" type="button" data-status="rejected">Rechazar</button>
          <button class="order-action" type="button" data-status="pending">Dejar pendiente</button>
          <a class="order-action" href="mailto:${encodeURIComponent(order.email)}?subject=${encodeURIComponent("Tu pedido de Tazita Studio")}" target="_blank" rel="noopener">Responder por correo</a>
        </div>
      </article>
    `).join("");
  }

  document.querySelector("#open-inbox").addEventListener("click", () => {
    renderOrders();
    inboxDialog.showModal();
  });
  document.querySelector("#close-inbox").addEventListener("click", () => inboxDialog.close());
  inboxDialog.addEventListener("click", (event) => {
    if (event.target === inboxDialog) inboxDialog.close();
  });
  document.querySelector("#order-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) return;
    const item = button.closest("[data-order-id]");
    const orders = getOrders();
    const order = orders.find((entry) => entry.id === item.dataset.orderId);
    if (!order) return;
    order.status = button.dataset.status;
    if (saveOrders(orders)) renderOrders();
  });

  const quantityInput = document.querySelector("#quantity");
  const fulfillmentInputs = Array.from(document.querySelectorAll('input[name="fulfillment"]'));
  const deliveryFields = document.querySelector("#delivery-fields");
  const priceEstimate = document.querySelector("#price-estimate");
  const deliveryAddressInput = document.querySelector("#delivery-address");
  const deliveryDistanceInput = document.querySelector("#delivery-distance-km");
  const deliveryDistanceUnitInput = document.querySelector("#delivery-distance-unit");
  const calculateDeliveryButton = document.querySelector("#calculate-delivery");
  const deliveryEstimateMessage = document.querySelector("#delivery-estimate");
  const orderTotalEstimate = document.querySelector("#order-total-estimate");
  const mapsRouteLink = document.querySelector("#maps-route-link");
  const SHIPPING_ORIGIN = "El Tabo, La Granja, Santiago, Chile";
  const SHIPPING_RATE_PER_100_METERS = 300;
  let deliveryEstimate = null;

  function getPrice(quantity) {
    if (quantity === 1) return 5000;
    if (quantity === 2) return 8500;
    return 8500 + (quantity - 2) * 5000;
  }
  function formatPesos(amount) {
    return `$${new Intl.NumberFormat("es-CL").format(amount)}`;
  }
  function updatePriceEstimate() {
    const quantity = Number(quantityInput.value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(getPrice(quantity))) {
      priceEstimate.textContent = "Ingresa una cantidad válida de tazas.";
      orderTotalEstimate.textContent = "Ingresa una cantidad válida de tazas.";
      return;
    }
    const productsPrice = getPrice(quantity);
    priceEstimate.textContent = `Productos: ${formatPesos(productsPrice)}${quantity === 2 ? " · ahorras $1.500" : ""}`;
    const fulfillmentMethod = form.querySelector('input[name="fulfillment"]:checked')?.value;
    if (fulfillmentMethod === "pickup") {
      orderTotalEstimate.textContent = `Total estimado (retiro): ${formatPesos(productsPrice)} · sin costo de envío`;
      return;
    }
    if (fulfillmentMethod !== "delivery") {
      orderTotalEstimate.textContent = "Elige cómo quieres recibir tu taza.";
      return;
    }
    const shippingIsCurrent = deliveryEstimate && deliveryEstimate.address === deliveryAddressInput.value.trim();
    orderTotalEstimate.textContent = shippingIsCurrent
      ? `Total estimado: ${formatPesos(productsPrice + deliveryEstimate.price)} (incluye envío)`
      : `Total estimado: ${formatPesos(productsPrice)} + envío por calcular`;
  }
  quantityInput.addEventListener("input", () => {
    quantityInput.setCustomValidity("");
    updatePriceEstimate();
  });

  function updateFulfillmentMethod() {
    const fulfillmentMethod = form.querySelector('input[name="fulfillment"]:checked')?.value;
    const isDelivery = fulfillmentMethod === "delivery";
    deliveryFields.hidden = !isDelivery;
    deliveryAddressInput.required = isDelivery;
    deliveryDistanceInput.required = isDelivery;
    if (isDelivery) updateMapsRouteLink();
    updatePriceEstimate();
  }

  fulfillmentInputs.forEach((input) => input.addEventListener("change", updateFulfillmentMethod));

  function calculateDelivery() {
    const address = deliveryAddressInput.value.trim();
    if (!address) {
      deliveryAddressInput.setCustomValidity("Escribe la dirección de entrega para calcular la ruta.");
      deliveryAddressInput.reportValidity();
      deliveryAddressInput.focus();
      return false;
    }
    deliveryAddressInput.setCustomValidity("");
    const enteredDistance = Number(String(deliveryDistanceInput.value).replace(",", "."));
    if (!Number.isFinite(enteredDistance) || enteredDistance <= 0) {
      deliveryDistanceInput.setCustomValidity("Ingresa una distancia válida en kilómetros o metros.");
      deliveryDistanceInput.reportValidity();
      deliveryDistanceInput.focus();
      return false;
    }
    deliveryDistanceInput.setCustomValidity("");
    const distanceMeters = Math.round(enteredDistance * (deliveryDistanceUnitInput.value === "km" ? 1000 : 1));
    if (!Number.isSafeInteger(distanceMeters) || distanceMeters <= 0) {
      deliveryDistanceInput.setCustomValidity("La distancia debe ser mayor que cero.");
      deliveryDistanceInput.reportValidity();
      deliveryDistanceInput.focus();
      return false;
    }
    const price = Math.ceil(distanceMeters / 100) * SHIPPING_RATE_PER_100_METERS;
    if (!Number.isSafeInteger(price)) {
      deliveryDistanceInput.setCustomValidity("La distancia ingresada es demasiado grande.");
      deliveryDistanceInput.reportValidity();
      deliveryDistanceInput.focus();
      return false;
    }
    deliveryEstimate = { address, distanceMeters, price };
    const distanceLabel = distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : `${distanceMeters} m`;
    deliveryEstimateMessage.textContent = `Distancia indicada: ${distanceLabel} · envío estimado ${formatPesos(price)}.`;
    updatePriceEstimate();
    return true;
  }

  calculateDeliveryButton.addEventListener("click", calculateDelivery);

  function updateMapsRouteLink() {
    const address = deliveryAddressInput.value.trim();
    mapsRouteLink.hidden = !address;
    if (!address) return;
    const params = new URLSearchParams({
      api: "1",
      origin: SHIPPING_ORIGIN,
      destination: address
    });
    mapsRouteLink.href = `https://www.google.com/maps/dir/?${params}`;
  }

  deliveryAddressInput.addEventListener("input", () => {
    deliveryEstimate = null;
    deliveryAddressInput.setCustomValidity("");
    deliveryEstimateMessage.textContent = "Si cambiaste la dirección, revisa nuevamente la ruta y sus kilómetros.";
    updateMapsRouteLink();
    updatePriceEstimate();
  });

  deliveryDistanceInput.addEventListener("input", () => {
    deliveryEstimate = null;
    deliveryDistanceInput.setCustomValidity("");
    deliveryEstimateMessage.textContent = "Calcula el precio con la distancia indicada.";
    updatePriceEstimate();
  });

  deliveryDistanceUnitInput.addEventListener("change", () => {
    deliveryEstimate = null;
    deliveryEstimateMessage.textContent = "Calcula el precio con la distancia indicada.";
    updatePriceEstimate();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const quantity = Number(fields.get("quantity"));
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(getPrice(quantity))) {
      quantityInput.setCustomValidity("Ingresa una cantidad válida de tazas.");
      quantityInput.reportValidity();
      return;
    }
    const fulfillmentMethod = String(fields.get("fulfillment"));
    const deliveryAddress = fulfillmentMethod === "delivery" ? String(fields.get("deliveryAddress")).trim() : "";
    let confirmedDeliveryEstimate = null;
    if (fulfillmentMethod === "delivery") {
      const currentDeliveryEstimate = deliveryEstimate &&
        deliveryEstimate.address === deliveryAddress &&
        deliveryEstimate.distanceMeters === Math.round(
          Number(String(fields.get("deliveryDistance")).replace(",", ".")) *
          (fields.get("deliveryDistanceUnit") === "km" ? 1000 : 1)
        )
        ? deliveryEstimate
        : null;
      if (!currentDeliveryEstimate && !calculateDelivery()) {
        return;
      }
      confirmedDeliveryEstimate = deliveryEstimate;
    }
    quantityInput.setCustomValidity("");
    const productsPrice = getPrice(quantity);
    const totalPrice = formatPesos(productsPrice + (confirmedDeliveryEstimate ? confirmedDeliveryEstimate.price : 0));
    const order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(fields.get("name")).trim(),
      email: String(fields.get("email")).trim(),
      phone: String(fields.get("phone")).trim(),
      quantity,
      fulfillmentMethod,
      deliveryAddress,
      deliveryDistanceMeters: confirmedDeliveryEstimate ? confirmedDeliveryEstimate.distanceMeters : null,
      deliveryPrice: confirmedDeliveryEstimate ? formatPesos(confirmedDeliveryEstimate.price) : null,
      totalPrice,
      message: String(fields.get("message")).trim(),
      price: formatPesos(productsPrice),
      design: canvas.toDataURL("image/png"),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const submitButton = form.querySelector('button[type="submit"]');
    const formNote = document.querySelector("#form-note");
    submitButton.disabled = true;
    formNote.textContent = "Enviando tu pedido…";
    fields.set("productPrice", order.price);
    fields.set("deliveryPrice", order.deliveryPrice || "No aplica");
    fields.set("totalPrice", order.totalPrice);
    fields.set("deliveryDistanceMeters", confirmedDeliveryEstimate ? String(confirmedDeliveryEstimate.distanceMeters) : "");
    fields.set("deliveryAddress", order.deliveryAddress);
    fields.set("deliveryDistance", confirmedDeliveryEstimate ? String(fields.get("deliveryDistance")) : "");
    fields.set("deliveryDistanceUnit", confirmedDeliveryEstimate ? String(fields.get("deliveryDistanceUnit")) : "");
    try {
      const designBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo preparar el diseño del pedido."));
        }, "image/png");
      });
      fields.set("design", new File([designBlob], "diseno-taza.png", { type: "image/png" }));
      const response = await fetch("/", { method: "POST", body: fields });
      if (!response.ok) throw new Error(`El servicio de pedidos respondió con HTTP ${response.status}.`);
    } catch (error) {
      console.error("No se pudo enviar el pedido a Netlify Forms.", error);
      formNote.textContent = "No se pudo enviar el pedido. Revisa tu conexión e inténtalo otra vez.";
      showToast("No se envió el pedido. Inténtalo de nuevo.");
      submitButton.disabled = false;
      return;
    }

    const orders = getOrders();
    orders.unshift(order);
    const savedLocally = saveOrders(orders);
    form.reset();
    deliveryEstimate = null;
    deliveryFields.hidden = true;
    deliveryAddressInput.required = false;
    deliveryDistanceInput.required = false;
    deliveryEstimateMessage.textContent = "Ingresa los kilómetros de la ruta y calcula el envío.";
    mapsRouteLink.hidden = true;
    updateFulfillmentMethod();
    updatePriceEstimate();
    openChat();
    chatTopics.hidden = true;
    chatStarted = true;
    formNote.textContent = "¡Pedido enviado! El taller lo recibió y podrá revisar los datos y el diseño.";
    addChatMessage(`¡Muchas gracias por tu pedido, ${order.name}! ☕💛✨ El taller recibió tu pedido y el total estimado es ${order.totalPrice}. ¡Que tengas un día precioso! 🌷😊`, "assistant");
    showToast(savedLocally
      ? "¡Gracias! Tu pedido y diseño llegaron al taller."
      : "Tu pedido llegó al taller; no se pudo guardar una copia en este navegador.");
    submitButton.disabled = false;
    renderOrders();
  });

  function getShareablePageUrl() {
    try {
      const pageUrl = new URL(window.location.href);
      const isLocalHost =
        pageUrl.hostname === "localhost" ||
        pageUrl.hostname.endsWith(".localhost") ||
        pageUrl.hostname === "127.0.0.1" ||
        pageUrl.hostname === "[::1]" ||
        pageUrl.hostname.endsWith(".local");
      if (!["http:", "https:"].includes(pageUrl.protocol) || isLocalHost || pageUrl.username || pageUrl.password) {
        return null;
      }
      pageUrl.hash = "";
      return pageUrl.href;
    } catch (error) {
      console.error("La dirección actual de la página no es válida.", error);
      return null;
    }
  }

  const currentUrl = getShareablePageUrl();
  const qrImage = document.querySelector("#qr-image");
  const qrDescription = document.querySelector("#qr-description");
  const copyLinkButton = document.querySelector("#copy-link");
  if (currentUrl) {
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(currentUrl)}`;
    copyLinkButton.disabled = false;
  } else {
    qrImage.hidden = true;
    qrDescription.textContent = "Publica la página en una dirección web para generar y copiar un enlace.";
    copyLinkButton.disabled = true;
  }
  copyLinkButton.addEventListener("click", async () => {
    if (!currentUrl) return;
    try {
      await navigator.clipboard.writeText(currentUrl);
      showToast("Enlace copiado. Ya puedes compartirlo.");
    } catch (error) {
      console.error("No se pudo copiar el enlace.", error);
      showToast(`Copia este enlace: ${currentUrl}`);
    }
  });

  const chatPanel = document.querySelector("#help-chat");
  const chatMessages = document.querySelector("#chat-messages");
  const chatTopics = document.querySelector("#chat-topics");
  const chatLauncher = document.querySelector("#open-chat");
  let chatStarted = false;
  let chatCloseTimer;
  let chatExpiryTimer;
  const CHAT_STORAGE_KEY = "tazita-chat-history-v1";
  const CHAT_HISTORY_LIMIT = 80;
  const CHAT_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
  const previousAnswerIndexes = new Map();

  const helpKnowledge = [
    { examples: ["como funciona la pagina", "como funciona esto", "como se usa la pagina", "que puedo hacer aqui", "que puedo hacer con la pagina", "que ofrece la pagina", "que hay en esta pagina", "para que sirve esta pagina", "explicame como funciona", "no entiendo como usarla"], answer: "La página te permite diseñar una taza en el lienzo de 23 × 9 cm, consultar los precios y enviar una solicitud con tus datos. Al terminar, se abre un borrador de correo que debes enviar. También puedes consultar los días de atención y hablar conmigo desde este chat." },
    { examples: ["como diseno mi taza", "como hago un diseno", "como hago mi taza", "como ago mi taza", "como puedo hacer mi taza", "puedo dibujar", "como agrego una foto", "como subo una imagen", "como agrego una imagen a la taza", "como anado una imagen a la taza", "como pongo una foto en la taza", "como pinto en la taza", "como pongo texto", "como descargo mi diseno", "que tamano tiene el lienzo"], answer: "En “Diseña tu taza” puedes dibujar con el dedo o el mouse, elegir color y grosor, agregar texto o subir una imagen. El área representa 23 × 9 cm. Usa “Descargar diseño” para guardar una copia PNG." },
    { examples: ["revisan mi diseno antes de imprimir", "puedo revisar mi diseno antes de imprimir", "confirman el diseno antes de imprimir", "me muestran como quedara la taza", "puedo confirmar el diseno de mi taza"], answer: "Sí. El diseño del editor es una referencia y el taller revisará contigo los detalles antes de imprimir. Puedes explicar los cambios que necesitas al confirmar tu pedido." },
    { examples: ["puedo elegir el color del diseno", "como cambio el color del dibujo", "que colores puedo usar en mi taza", "puedo cambiar el color del texto", "como elijo el color para dibujar"], answer: "En el editor puedes elegir el color del trazo y del texto con el selector de color. El color que ves es una referencia del diseño; confirma con el vendedor cualquier detalle del resultado impreso." },
    { examples: ["puedo disenar desde el celular", "se puede usar el editor en el celular", "puedo dibujar con el dedo", "como diseno la taza desde mi telefono", "funciona en el telefono"], answer: "Sí. El editor permite dibujar con el dedo en pantallas táctiles o con el mouse en una computadora. También puedes agregar texto o subir una imagen." },
    { examples: ["como hago un pedido", "como encargo una taza", "como compro", "como mando mi pedido", "que datos necesito para pedir", "donde esta el formulario"], answer: "Ve a la sección “Pedir” y completa tu nombre, correo, cantidad y los detalles de tu idea. Al pulsar “Enviar mi pedido”, se guarda en este navegador y se abre un borrador dirigido al taller. Debes pulsar Enviar en tu aplicación de correo para avisar al vendedor." },
    { examples: ["cuanto cuesta una taza", "cual es el precio", "cuanto salen dos tazas", "cuanto cuestan tres tazas", "precio por taza", "hay descuento por dos", "cuanto pago por mi pedido"], answer: "Una taza cuesta $5.000; dos cuestan $8.500. Si pides más de dos, las primeras dos cuestan $8.500 y cada taza adicional $5.000. El formulario calcula el total automáticamente." },
    { examples: ["cuando atienden", "cuales son los dias de atencion", "que dias esta abierto", "cual es el horario", "puedo ver la disponibilidad", "como veo si atienden hoy"], answer: "El horario de atención en los días disponibles es de 10:00 a. m. a 5:30 p. m. Pulsa “Ver días de atención” al inicio de la página para consultar el calendario semanal actualizado." },
    { examples: ["cuando llegan", "cuando llega", "cuando llega mi taza", "cuando llega mi pedido", "cuando recibo mi taza", "cuando recibire el pedido", "cuanto tarda el envio", "cuanto demora el envio", "tiempo de envio", "cuando entregan", "cual es la fecha de entrega"], answer: "La fecha de llegada la determina el vendedor. Si quieres información sobre el tiempo de envío de tu pedido, escríbele directamente a Mauriciodanielriveracruz@gmail.com." },
    { examples: ["donde hacen entregas", "en que zonas entregan", "entregan en la granja", "pueden entregar cerca de mi casa", "cual es la zona de entrega", "hacen envios a otras comunas"], answer: "Por ahora, las entregas están limitadas a sectores cercanos a la calle El Tavo, comuna La Granja. Para consultar si pueden coordinar otra ubicación, escribe a Mauriciodanielriveracruz@gmail.com." },
    { examples: ["cuanto cuesta el envio", "cobran por la entrega", "cual es el costo del envio", "cuanto sale llevar la taza", "el envio esta incluido", "puedo retirar mi taza", "pueden llevarla a mi casa"], answer: "En el pedido puedes elegir que la taza llegue a tu domicilio o pasar a retirarla. Para entrega, Google Maps abre una ruta aproximada y puedes ingresar la distancia en kilómetros o metros para calcular el estimado: $300 por cada 100 metros o fracción. Para retiro no se suma costo de envío; el punto se coordina con el vendedor. La zona de entrega es cercana a El Tavo, La Granja." },
    { examples: ["que pasa si mi taza se rompe", "que pasa si mi taza viene rota", "que pasa si mi taza biene rota", "mi taza llego rota", "mi taza se rompio", "que hago si la taza llega rota"], answer: "Si tu taza llegó rota, toma fotos de la taza y del embalaje y escribe a Mauriciodanielriveracruz@gmail.com para contarle lo ocurrido. El sitio no especifica una política de cambios o reposición, así que el vendedor podrá indicarte cómo resolverlo." },
    { examples: ["que pasa si el diseno de mi taza no me gusta", "que hago si no me gusta el diseno de mi taza", "no me gusto el diseno de mi taza", "puedo cambiar el diseno de mi taza"], answer: "Si todavía no envías el pedido, puedes editar el diseño en la página antes de enviarlo. Si ya lo enviaste o la taza está hecha, escribe a Mauriciodanielriveracruz@gmail.com para consultar las opciones; el sitio no especifica una política de cambios." },
    { examples: ["las tazas son muy funcionales", "son funcionales las tazas", "que tan funcionales son las tazas", "para que sirven las tazas"], answer: "Sí, una taza es práctica para tomar tus bebidas favoritas y además puedes personalizar su diseño. No tengo información sobre si este modelo se puede usar en microondas o lavavajillas; consúltalo con el vendedor antes de hacerlo." },
    { examples: ["que puedo tomar en tus tazas", "que puedo tomar en una taza", "que puedo beber en una taza", "que bebidas puedo tomar en una taza", "que liquidos puedo tomar en la taza", "que puedo tomar en mi taza"], answers: ["Puedes disfrutar café, té, chocolate caliente, leche o tu infusión favorita. ¡Elige la bebida que más te guste!", "Tu taza puede acompañar café, té, chocolate caliente, leche, mate o una bebida fría. Solo confirma con el vendedor si necesitas saber si el modelo es apto para bebidas muy calientes.", "Hay muchas opciones: café, té, chocolate, leche, infusiones o agua. ¿Cuál es tu favorita?", "Puedes usarla para tus bebidas favoritas, como café, té, chocolate caliente o una infusión. Para bebidas frías también puede servir; consulta al vendedor si tienes dudas sobre el material.", "¡La que más te guste! Café, té, leche, chocolate caliente o una infusión son buenas opciones. ☕"] },
    { examples: ["las tazas son de buena calidad", "son de buena calidad las tazas", "las tazas son buenas", "que calidad tienen las tazas", "la taza es de buena calidad"], answer: "Cada pedido se prepara con atención al detalle y el taller revisa contigo el diseño antes de imprimir. La página no publica especificaciones ni pruebas sobre la calidad del material; puedes consultarlas directamente con el vendedor en Mauriciodanielriveracruz@gmail.com." },
    { examples: ["de que material es la taza", "cuanta capacidad tiene la taza", "que tamaño tiene la taza", "se puede usar en microondas", "se puede lavar en lavavajillas", "la taza es apta para microondas", "la taza es apta para lavavajillas"], answer: "La página no indica el material, la capacidad ni si la taza es apta para microondas o lavavajillas. Para cuidar tu taza, confirma esas especificaciones con el vendedor antes de usarla." },
    { examples: ["como puedo pagar", "que medios de pago aceptan", "puedo pagar con tarjeta", "aceptan transferencia", "cuando se paga"], answer: "La página aún no especifica los medios de pago. Incluye tu consulta en el formulario y el vendedor te indicará cómo coordinarlo." },
    { examples: ["como funciona el codigo qr", "como comparto la pagina", "donde esta el enlace", "puedo escanear el qr", "como abro la tienda desde el celular"], answer: "El QR y el enlace abren esta tienda para que tus clientes diseñen y envíen un pedido desde su celular. El QR debe compartirse después de publicar la página en GitHub Pages." },
    { examples: ["como llega el pedido al vendedor", "el pedido se envia automaticamente", "ya recibiste mi pedido", "le llega un correo al vendedor", "como contacto al vendedor"], answer: "Al enviar el formulario, se abre un borrador dirigido a Mauriciodanielriveracruz@gmail.com, pero tienes que pulsar Enviar. En esta versión, además, el pedido se guarda solo en el navegador usado y no se sincroniza con el vendedor automáticamente." },
    { examples: ["como hablo con alguien", "quiero contactar", "cual es el correo", "como escribo a mauricio", "necesito ayuda personalizada"], answer: "Puedes escribir directamente a Mauriciodanielriveracruz@gmail.com o dejar tus datos en el formulario para conversar sobre tu pedido." },
    { examples: ["hola", "buenas", "buenos dias", "buenas tardes"], answer: "¡Hola! Puedo orientarte sobre cómo funciona la página, diseñar y pedir una taza, precios, horario, entregas o contacto. ¿Qué necesitas saber?" },
    { examples: ["ok", "okay", "ok gracias", "gracias", "muchas gracias", "gracias por la ayuda", "te agradezco"], answer: "¡De nada! ☕💛 Me alegra poder ayudarte. Si te surge otra duda sobre tu taza o tu pedido, aquí estoy." },
    { examples: ["uwu", "owo", "xd", "jaja", "jeje"], answer: "¡Jaja, gracias por la buena onda! 😊 ¿Te ayudo con algo de tu taza personalizada?" },
    { examples: ["me gusta", "me gusta la idea", "me agrada la idea", "suena bien", "me parece buena idea"], answer: "¡Qué bueno que te guste! ☕✨ Cuando quieras, puedes empezar tu diseño o completar el formulario para pedir tu taza." },
    { examples: ["de acuerdo", "estoy de acuerdo", "ok de acuerdo", "esta bien", "perfecto"], answer: "¡Perfecto! 😊 Si quieres continuar, puedes diseñar tu taza o enviar tu pedido cuando estés listo." },
    { examples: ["eres una ia mujer", "eres una inteligencia artificial mujer", "eres mujer", "eres hombre", "tienes genero"], answer: "Soy una asistente virtual de Tazita Studio. Mi creador me asignó un género femenino y espero que eso no sea una molestia para ti 😊." },
    { examples: ["te amo", "te quiero"], answer: "¡Qué lindo, gracias por el cariño! 💛 Estoy aquí para ayudarte con tu idea de taza cuando quieras ☕😊." },
    { examples: ["eres amable", "que amable", "eres muy amable", "que linda"], answer: "¡Muchas gracias! 😊 Me alegra acompañarte. ¿Quieres que te ayude con algo más de tu taza?" },
    { examples: ["no", "nop"], answer: "¡Está bien! 😊 Si quieres, dime qué prefieres o pregúntame cualquier otra cosa sobre las tazas." },
    { examples: ["no me molesta", "no te preocupes", "nada", "descuida", "no es ninguna molestia"], answer: "¡Gracias por decírmelo! 😊 Me alegra que no te moleste. Estoy aquí para ayudarte con lo que necesites." },
    { examples: ["te prefiero como chica", "te prefiero como mujer", "prefiero que seas chica"], answer: "¡Gracias por decírmelo! 😊 Mi creador me asignó un género femenino y espero que eso no sea una molestia para ti." },
    { examples: ["soy hombre", "soy un hombre", "soy mujer", "soy una mujer"], answer: "¡Gracias por contármelo! 😊 ¿En qué más puedo ayudarte?" },
    { examples: ["podemos ser amigos", "podemos ser amigas", "amigos", "amigas"], answer: "¡Claro! Podemos conversar con confianza y llevarnos bien 😊. Soy una asistente virtual, pero aquí estoy para ayudarte y acompañarte con tus ideas." },
    { examples: ["eres mujer", "eres chica", "eres una chica", "eres mujer?"], answers: ["Soy una asistente virtual de Tazita Studio. Mi creador me asignó un género femenino y espero que eso no sea una molestia para ti 😊.", "Me identifico con el género femenino porque así me configuró mi creador. ¡Espero que te parezca bien! 😊"] },
    { examples: ["te agrado", "te caigo bien", "te agrado?"], answers: ["¡Me alegra conversar contigo! No tengo sentimientos como una persona, pero estoy aquí para tratarte con amabilidad y ayudarte 😊.", "Disfruto acompañarte en esta conversación como asistente. ¿Qué te gustaría hacer ahora: pensar un diseño o seguir charlando? ☕"] },
    { examples: ["como deberia empezar a realizar mi taza", "como empiezo mi taza", "como comienzo a hacer mi taza", "como deberia empezar"], answers: ["¡Empecemos fácil! Primero piensa para quién es y qué estilo le gusta. Luego elige una frase o una imagen, y pruébala en el lienzo de 23 × 9 cm. ¿Es para ti o para regalar?", "Puedes empezar eligiendo una sola cosa: un color favorito, una frase corta o una foto. Después dibújala, escríbela o súbela en “Diseña tu taza”. No tiene que quedar perfecta desde el primer intento 😊.", "Primero define la ocasión (cumpleaños, amistad o uso diario); luego elige un tema y dos colores. En el editor puedes probarlos, borrar y empezar de nuevo hasta que te guste."] },
    { examples: ["algun consejo para mi taza", "consejos para mi taza", "que consejo me das para mi diseno", "como hago que se vea bien"], answers: ["Elige un mensaje corto y deja espacio libre alrededor: así se leerá mejor al imprimir. Puedes usar uno o dos colores que combinen y revisar la vista completa antes de enviar.", "Piensa en quién la recibirá. Un nombre, una fecha o una frase que tenga significado suele hacerla especial. Evita poner demasiados elementos pequeños en el lienzo.", "Prueba primero una idea simple: un dibujo principal, una frase breve y un fondo limpio. Luego descarga el PNG para revisar que todo se entienda."] },
    { examples: ["que diseno puedo pedir", "que disenos puedo pedir", "que diseño puedo pedir", "que puedo poner en mi taza", "ideas para una taza", "dame una idea para una taza"], answers: ["Puedes pedir una taza con nombre y flores, una foto con una fecha especial o una frase divertida. ¿Qué prefieres: algo tierno, elegante o gracioso?", "Algunas ideas: una taza para celebrar un cumpleaños, una frase motivadora, una ilustración de tu mascota o un diseño inspirado en tus colores favoritos. ¿Para quién sería?", "Podrías hacer un diseño minimalista con iniciales, un recuerdo familiar o un pequeño dibujo que te represente. Si me dices la ocasión, te propongo algo más a tu gusto."] },
    { examples: ["no se me ocurre nada", "no tengo ideas", "no se que hacer", "que hago", "que ago", "estoy sin ideas", "ayudame", "ayudame a elegir"], answers: ["¡Claro, pensemos juntas! 😊 ¿La taza es para ti o para regalar? Mientras decides, puedes elegir entre tres caminos: una frase corta, una foto especial o un dibujo sencillo.", "No pasa nada, las ideas aparecen probando. Dime para quién es y qué le gusta; si no sabes, empezamos con un nombre, dos colores favoritos y un pequeño corazón o estrella.", "Te ayudo paso a paso: elige una ocasión (cumpleaños, agradecimiento o uso diario), luego un estilo (tierno, elegante o divertido). ¿Cuál de esas opciones te llama más?", "Una idea fácil: escribe un nombre al centro y agrega alrededor pequeños detalles de algo que le guste a esa persona. ¿Qué color o tema te gustaría usar?"] },
    { examples: ["murder drones", "fortnite", "ben 10", "el circo digital", "circo digital", "genshin impact", "genshin impac", "zenless zone zero", "hero academy", "my hero academia"], answers: ["¡Qué buenos temas para inspirar una taza! Podemos tomar colores, símbolos o una frase original inspirada en tu serie o juego favorito. ¿Cuál de esos mundos te gustaría usar y para quién es la taza?", "Hay muchas posibilidades: un diseño con colores intensos, un apodo gamer o una frase propia inspirada en tus personajes favoritos. No hace falta copiar una imagen oficial; podemos crear algo original. ¿Qué estilo prefieres?", "No veo series ni juego por cuenta propia, pero puedo ayudarte a convertir esos gustos en una idea original para tu taza. Elige un tema y dos colores, y pensamos una composición sencilla ☕🎨."] }
  ];

  function normalizeText(text) {
    return text.toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[¿?¡!.,;:()[\]{}'"“”‘’]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const ignoredWords = new Set(["a", "al", "algun", "algo", "como", "con", "cual", "cuales", "cuando", "cuanto", "de", "del", "donde", "el", "ella", "en", "es", "esta", "este", "la", "las", "le", "lo", "los", "mi", "mis", "o", "para", "por", "puede", "puedo", "que", "quiero", "se", "si", "sobre", "su", "un", "una", "unas", "uno", "unos", "y"]);

  function tokenize(text) {
    return normalizeText(text).split(" ")
      .filter((word) => word.length > 1 && !ignoredWords.has(word))
      .map((word) => word.length > 5 && word.endsWith("s") ? word.slice(0, -1) : word);
  }

  const helpVocabulary = new Set(helpKnowledge.flatMap((entry) => entry.examples.flatMap((example) => tokenize(example))));
  const OUT_OF_SCOPE_MESSAGE = "Ese es un tema fuera de mi área de trabajo. Lo lamento. Mejor hablemos de algo acorde a esta área de tazas :3";
  const CUP_MENTION_REGEX = /\b(?:taza|tazas|tacita|tacitas)\b/;
  const INAPPROPRIATE_CONTENT_TERMS = [
    "puta", "puto", "putas", "putos", "mierda", "carajo", "cabron", "cabrona",
    "hueon", "hueona", "weon", "weona", "wea", "chucha", "concha", "culiao",
    "culiada", "culiado", "maricon", "maricona", "pendejo", "pendeja", "zorra",
    "perra", "gil", "tonto", "tonta", "idiota", "imbecil", "estupido", "estupida",
    "fuck", "shit", "bitch", "asshole", "dick", "cock", "pussy", "tetas", "pene",
    "penes", "pija", "porno", "pornografia", "sexo", "sexual", "sexuales", "r34",
    "perrita", "fluido", "fluidos", "reproductivo", "reproductiva", "reproductivos",
    "reproductivas", "vagina", "vaginas", "vulva", "vulvas", "orgasmo", "masturbacion",
    "ereccion", "testiculo", "testiculos"
  ];
  const INAPPROPRIATE_CONTENT_REGEX = new RegExp(
    `(?:^|[^a-z0-9])(?:${INAPPROPRIATE_CONTENT_TERMS.map((term) =>
      term.split("").join("[\\s._*-]*")
    ).join("|")})(?:$|[^a-z0-9])|(?:^|[^a-z0-9])rule[\\s._*-]*34(?:$|[^a-z0-9])`,
    "i"
  );
  const JOINED_INAPPROPRIATE_TERMS = [
    "vagina", "vaginas", "vulva", "vulvas", "orgasmo", "masturbacion", "ereccion",
    "testiculo", "testiculos", "pornografia", "porno", "sexual"
  ];

  function containsInappropriateContent(text) {
    const normalizedText = normalizeText(text)
      .replace(/[013457]/g, (character) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[character])
      .replace(/[^a-z0-9\s]/g, " ");
    const compactText = normalizedText.replace(/\s+/g, "");
    return INAPPROPRIATE_CONTENT_REGEX.test(normalizedText) ||
      JOINED_INAPPROPRIATE_TERMS.some((term) => compactText.includes(term));
  }

  function isSexualizedMilkQuestion(text) {
    const normalizedText = normalizeText(text).replace(/[^a-z0-9\s]/g, " ");
    return /\b(?:beber|tomar|bebo|tomo)\s+leche\s+de\s+(?:ti|vos|usted)\b/.test(normalizedText);
  }

  function asksAboutCupBeverages(text) {
    const normalizedText = normalizeText(text);
    return CUP_MENTION_REGEX.test(normalizedText) &&
      /\b(?:tomar|tomas|tomamos|tomarias|beber|bebes|beberias)\b/.test(normalizedText);
  }

  function asksForMediaInspiredDesign(text) {
    return /\b(?:anime|comic|manga)\b/.test(normalizeText(text));
  }

  function getCustomDesignName(text) {
    const match = normalizeText(text).match(/\b(?:diseno|estampado)\s+(?:de|inspirado en)\s+(.+?)(?:\s+(?:por favor|porfa|porfis|uwu|owo))?$/);
    if (!match) return null;

    const designName = match[1].trim();
    if (!designName || /^(?:mi\s+)?(?:anime|comic|manga)(?:\s+favorit[oa])?$/.test(designName)) return null;
    const lowercaseWords = new Set(["a", "de", "del", "en", "la", "las", "los", "y"]);
    return designName.split(/\s+/).map((word, index) => {
      if (index > 0 && lowercaseWords.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
    }).join(" ");
  }

  function editDistanceWithinTwo(left, right) {
    if (Math.abs(left.length - right.length) > 2) return false;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      let rowMinimum = row;
      for (let column = 1; column <= right.length; column += 1) {
        const cost = left[row - 1] === right[column - 1] ? 0 : 1;
        current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + cost);
        rowMinimum = Math.min(rowMinimum, current[column]);
      }
      if (rowMinimum > 2) return false;
      previous = current;
    }
    return previous[right.length] <= (left.length >= 8 && right.length >= 8 ? 2 : 1);
  }

  function getSimilarity(questionTokens, example) {
    const exampleTokens = tokenize(example);
    if (!questionTokens.length || !exampleTokens.length) return 0;
    let matched = 0;
    for (const token of questionTokens) {
      if (exampleTokens.some((candidate) => token === candidate || (Math.min(token.length, candidate.length) >= 4 && editDistanceWithinTwo(token, candidate)))) matched += 1;
    }
    const queryCoverage = matched / questionTokens.length;
    const topicCoverage = matched / exampleTokens.length;
    return queryCoverage * 0.35 + topicCoverage * 0.65;
  }

  function getCupRelatedAnswer(question) {
    const normalizedQuestion = normalizeText(question);
    const findEntry = (example) => helpKnowledge.find((entry) => entry.examples.includes(example));

    if (/\b(?:calidad|buena|buenas|bueno|buenos|resistente|durable)\b/.test(normalizedQuestion)) {
      return findEntry("las tazas son de buena calidad").answer;
    }
    if (/\b(?:leche|cafe|te|bebida|bebidas|liquido|liquidos)\b/.test(normalizedQuestion)) {
      return findEntry("las tazas son muy funcionales").answer;
    }
    if (/\b(?:microondas|lavavajillas|material|capacidad|tamano)\b/.test(normalizedQuestion)) {
      return findEntry("de que material es la taza").answer;
    }
    if (/\b(?:diseno|imagen|foto|color|dibujar|personalizar|personalizada|personalizadas)\b/.test(normalizedQuestion)) {
      const designAnswer = findEntry("como diseno mi taza").answer;
      const reviewAnswer = findEntry("revisan mi diseno antes de imprimir").answer;
      return `${designAnswer} ${reviewAnswer}`;
    }
    if (/\b(?:envio|entrega|entregas|entregar|llegada|llega|recibir)\b/.test(normalizedQuestion)) {
      return findEntry("donde hacen entregas").answer;
    }

    const designAnswer = findEntry("como diseno mi taza").answer;
    const priceAnswer = findEntry("cuanto cuesta una taza").answer;
    return `Puedo orientarte sobre tu taza. ${designAnswer} ${priceAnswer} Para detalles del producto que no estén publicados, consulta al vendedor en Mauriciodanielriveracruz@gmail.com.`;
  }

  function getChatHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
      if (!Array.isArray(history)) return [];
      const now = Date.now();
      const retainedHistory = history.filter((item) => {
        if (!item || typeof item.createdAt !== "string") return false;
        const createdAt = Date.parse(item.createdAt);
        return Number.isFinite(createdAt) && createdAt <= now && now - createdAt < CHAT_HISTORY_TTL_MS;
      }).slice(-CHAT_HISTORY_LIMIT);
      if (retainedHistory.length !== history.length) {
        if (retainedHistory.length) {
          localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(retainedHistory));
        } else {
          localStorage.removeItem(CHAT_STORAGE_KEY);
        }
      }
      scheduleChatExpiry(retainedHistory);
      return retainedHistory;
    } catch (error) {
      console.error("No se pudo leer el historial del asistente.", error);
      return [];
    }
  }

  function scheduleChatExpiry(history) {
    window.clearTimeout(chatExpiryTimer);
    if (!history.length) return;
    const expiresAt = Date.parse(history[0].createdAt) + CHAT_HISTORY_TTL_MS;
    const delay = Math.max(0, expiresAt - Date.now());
    chatExpiryTimer = window.setTimeout(() => {
      const retainedHistory = getChatHistory();
      chatMessages.replaceChildren();
      for (const item of retainedHistory) {
        if (item && (item.speaker === "user" || item.speaker === "assistant") && typeof item.text === "string") {
          addChatMessage(item.text, item.speaker, false);
        }
      }
    }, Math.min(delay + 20, 2147483647));
  }

  function addChatMessage(text, speaker, save = true) {
    const message = document.createElement("p");
    message.className = `chat-message chat-message-${speaker}`;
    message.textContent = text;
    chatMessages.append(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (!save) return;
    const history = getChatHistory();
    history.push({ speaker, text, createdAt: new Date().toISOString() });
    try {
      const retainedHistory = history.slice(-CHAT_HISTORY_LIMIT);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(retainedHistory));
      scheduleChatExpiry(retainedHistory);
    } catch (error) {
      console.error("No se pudo guardar el historial del asistente.", error);
      showToast("No se pudo guardar la conversación en este navegador.");
    }
  }

  function getHelpAnswer(question) {
    const normalizedQuestion = normalizeText(question);
    if (!normalizedQuestion || /^[.…\s]+$/.test(question)) {
      return "¿Te quedó alguna duda? 😊 Puedes preguntarme sobre cómo funciona la página, diseños, pedidos, precios u horarios.";
    }
    if (isSexualizedMilkQuestion(question)) {
      return "Esa pregunta tiene un doble sentido y no puedo seguir ese tipo de conversación. Si quieres saber sobre bebidas o el uso de la taza, con gusto te ayudo.";
    }
    if (containsInappropriateContent(question)) {
      return "No puedo responder mensajes con lenguaje ofensivo o contenido sexual. Mantengamos la conversación respetuosa y centrada en las tazas.";
    }
    if (!CUP_MENTION_REGEX.test(normalizedQuestion)) return OUT_OF_SCOPE_MESSAGE;
    if (asksAboutCupBeverages(question)) {
      const beverageEntry = helpKnowledge.find((entry) => entry.examples.includes("que puedo tomar en tus tazas"));
      const choices = beverageEntry.answers;
      const previousIndex = previousAnswerIndexes.get(beverageEntry) ?? -1;
      const availableChoices = choices.map((_, index) => index).filter((index) => index !== previousIndex);
      const selectedIndex = availableChoices[Math.floor(Math.random() * availableChoices.length)];
      previousAnswerIndexes.set(beverageEntry, selectedIndex);
      return choices[selectedIndex];
    }
    const customDesignName = getCustomDesignName(question);
    if (customDesignName) {
      return `¡Pero por supuesto! Puedes tener una taza personalizada de ${customDesignName} uwu. Solo imagínalo, créalo en el tablero de dibujo o coméntalo en tu pedido owo.`;
    }
    if (asksForMediaInspiredDesign(question)) {
      return "¡Sí! Puedes pedir una taza con un diseño inspirado en tu anime, cómic o manga favorito. Indica el título y la idea en el formulario; el diseño debe ser original y no incluir contenido sexual explícito.";
    }

    const questionTokens = tokenize(question);
    const hasUnknownToken = questionTokens.some((token) => !helpVocabulary.has(token));
    if (!questionTokens.length) {
      return "¡Gracias por escribirme! 😊 Si necesitas ayuda con tu taza, cuéntame un poco más qué te gustaría saber.";
    }
    let bestMatch = null;
    for (const entry of helpKnowledge) {
      const score = Math.max(...entry.examples.map((example) => getSimilarity(questionTokens, example)));
      if (!bestMatch || score > bestMatch.score) bestMatch = { score, entry };
    }
    if (bestMatch && bestMatch.score >= 0.55) {
      const entry = bestMatch.entry;
      if (!entry.answers) return entry.answer;
      const previousIndex = previousAnswerIndexes.get(entry) ?? -1;
      const choices = entry.answers.map((_, index) => index).filter((index) => index !== previousIndex);
      const selectedIndex = choices[Math.floor(Math.random() * choices.length)];
      previousAnswerIndexes.set(entry, selectedIndex);
      return entry.answers[selectedIndex];
    }
    return getCupRelatedAnswer(question);
  }

  for (const item of getChatHistory()) {
    if (item && (item.speaker === "user" || item.speaker === "assistant") && typeof item.text === "string") {
      addChatMessage(item.text, item.speaker, false);
    }
  }

  function askHelp(question) {
    const cleanedQuestion = question.trim();
    if (!cleanedQuestion) return;
    addChatMessage(cleanedQuestion, "user");
    addChatMessage(getHelpAnswer(cleanedQuestion), "assistant");
    chatTopics.hidden = true;
  }

  function openChat() {
    window.clearTimeout(chatCloseTimer);
    chatPanel.hidden = false;
    chatPanel.setAttribute("aria-hidden", "false");
    chatLauncher.setAttribute("aria-expanded", "true");
    void chatPanel.offsetWidth;
    chatPanel.classList.add("chat-is-open");
  }

  function closeChat() {
    chatPanel.classList.remove("chat-is-open");
    chatPanel.setAttribute("aria-hidden", "true");
    chatLauncher.setAttribute("aria-expanded", "false");
    window.clearTimeout(chatCloseTimer);
    chatCloseTimer = window.setTimeout(() => {
      if (!chatPanel.classList.contains("chat-is-open")) chatPanel.hidden = true;
    }, 300);
  }

  chatPanel.addEventListener("transitionend", (event) => {
    if (event.target === chatPanel && event.propertyName === "opacity" && !chatPanel.classList.contains("chat-is-open")) {
      chatPanel.hidden = true;
    }
  });

  chatLauncher.addEventListener("click", () => {
    openChat();
    if (!chatStarted) {
      if (!chatMessages.childElementCount) {
        const greeting = userProfile
          ? `${getWelcomeGreeting(userProfile)} Soy la ayuda automática de Tazita Studio. Pregúntame con tus propias palabras; buscaré el tema más parecido entre las respuestas de ayuda.`
          : "¡Hola! Soy la ayuda automática de Tazita Studio. Pregúntame con tus propias palabras; buscaré el tema más parecido entre las respuestas de ayuda.";
        addChatMessage(greeting, "assistant");
      }
      chatStarted = true;
    }
    document.querySelector("#chat-input").focus();
  });
  document.querySelector("#close-chat").addEventListener("click", () => {
    closeChat();
    chatLauncher.focus();
  });
  document.querySelector("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#chat-input");
    askHelp(input.value);
    input.value = "";
    input.focus();
  });
  chatTopics.addEventListener("click", (event) => {
    const topic = event.target.closest("button[data-question]");
    if (topic) askHelp(topic.dataset.question);
  });

  renderOrders();
})();
