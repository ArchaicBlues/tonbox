<!DOCTYPE html>
<html lang="en">
<head>
    <%- include('../partials/head'); %>
</head>
<!-- <body class="container"> -->

<header>
    <%- include('../partials/header'); %>
</header>

<main>

</main>

<script>
    <%- include('../partials/footer'); %>


document.addEventListener('click', function (event) {
  const menuToggle = document.getElementById('menu-toggle');
  const mainMenu = document.getElementById('main-menu-bar');

  if (menuToggle.checked) {
    // Prüfen, ob der Klick AUSSERHALB der Navbar (main-menu-bar) war
    // .contains prüft, ob das geklickte Element (event.target) Teil der Navbar ist
    if (!mainMenu.contains(event.target)) {
      menuToggle.checked = false;
    }
  }
});
</script>
</body>
</html>