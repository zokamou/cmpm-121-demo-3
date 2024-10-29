import "./style.css";

// see `../index.html` for the definition of the element with id `app`
const app = document.querySelector<HTMLDivElement>("#app")!;

const APP_NAME = "Hello";

document.title = APP_NAME;
app.innerHTML = APP_NAME;
