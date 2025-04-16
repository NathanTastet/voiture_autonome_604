// static/build/pilotage.js

document.addEventListener("DOMContentLoaded", function () {
    let modeSelector = document.getElementById("mode-selector");
    let manualControls = document.getElementById("manual-controls");
    let autoBtn = document.getElementById("go-auto");
    let manualMode = false;
    let gamepadIndex = null;
  
    modeSelector.addEventListener("change", function () {
      if (this.value === "manuel") {
        manualMode = true;
        manualControls.classList.remove("d-none");
        autoBtn.classList.add("d-none");
      } else {
        manualMode = false;
        manualControls.classList.add("d-none");
        autoBtn.classList.remove("d-none");
      }
    });
  
    window.addEventListener("gamepadconnected", function (e) {
      gamepadIndex = e.gamepad.index;
      document.getElementById("gamepad-popup").style.display = "flex";
      console.log("Manette connectée:", e.gamepad);
      requestAnimationFrame(readGamepadInput);
    });
  
    function readGamepadInput() {
      if (!manualMode || gamepadIndex === null) return;
      let gp = navigator.getGamepads()[gamepadIndex];
      if (!gp) return;
  
      if (gp.buttons[7].pressed) console.log("Accélérer (R2)");
      if (gp.buttons[6].pressed) console.log("Freiner / Reculer (L2)");
  
      let axis = gp.axes[0];
      if (axis < -0.2) console.log("Tourner à gauche");
      else if (axis > 0.2) console.log("Tourner à droite");
  
      requestAnimationFrame(readGamepadInput);
    }
  
    document.getElementById("go-auto").addEventListener("click", function () {
      alert("Mode automatique lancé.");
      // Envoie d'une commande pour activer l'autopilot
    });
  });
  