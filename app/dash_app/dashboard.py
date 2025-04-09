from dash import Dash, html, dcc
import dash_bootstrap_components as dbc
import plotly.graph_objs as go
from flask import request

def create_dashboard(server):
    dash_app = Dash(
        __name__,
        server=server,
        url_base_pathname='/dash_internal/',
        assets_folder='static',
        external_stylesheets=["/static/build/main_css.bundle.css"],
        suppress_callback_exceptions=True,
    )

    def serve_layout():
        # Récupère le thème via les paramètres d'URL
        theme = request.args.get("theme", "dark")
        is_dark = theme == "dark"

        # Thème
        bg_color = "#0F172A" if is_dark else "#ffffff"
        font_color = "#F8FAFC" if is_dark else "#1E293B"
        theme_class = "bg-dark text-light" if is_dark else "bg-light text-dark"

        # Graph
        graph = dcc.Graph(
            figure=go.Figure(
                data=[go.Scatter(y=[1, 3, 2, 4])],
                layout=go.Layout(
                    title="Exemple de courbe",
                    plot_bgcolor=bg_color,
                    paper_bgcolor=bg_color,
                    font=dict(color=font_color)
                )
            ),
            config={"displayModeBar": False},
            style={"height": "100%"}
        )

        # Jauge
        gauge = dcc.Graph(
            figure=go.Figure(
                go.Indicator(
                    mode="gauge+number",
                    value=72,
                    title={'text': "Battery level", 'font': {'color': font_color}},
                    gauge={
                        'axis': {'range': [0, 100], 'tickcolor': font_color},
                        'bar': {'color': "#24D29C"},
                        'bgcolor': bg_color,
                        'bordercolor': font_color,
                        'borderwidth': 2,
                        'steps': [
                            {'range': [0, 50], 'color': '#E84D4D'},
                            {'range': [50, 100], 'color': '#24D29C'}
                        ]
                    },
                    number={'font': {'color': font_color}}
                ),
                layout=go.Layout(
                    paper_bgcolor=bg_color,
                    font=dict(color=font_color)
                )
            ),
            config={"displayModeBar": False},
            style={"height": "100%"}
        )

        return html.Div([
            dbc.Container([
                dbc.Row([
                    dbc.Col(graph, md=6),
                    dbc.Col(gauge, md=6)
                ])
            ], fluid=True, style={"maxWidth": "100%", "overflowX": "hidden"})
        ], className=f"py-4 {theme_class}", style={"height": "100vh", "overflow": "hidden"})


    # layout dynamique
    dash_app.layout = serve_layout

    # HTML custom de la page Dash (intégré dans un iframe)
    dash_app.index_string = """
    <!DOCTYPE html>
    <html>
        <head>
            {%metas%}
            <title>Dashboard</title>
            {%favicon%}
            {%css%}
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    overflow: hidden; /* ⛔️ enlève scroll vertical */
                }
                #dash-container {
                    height: 100%;
                    width: 100%;
                }
            </style>
            <script>
            window.addEventListener("message", (event) => {
                if (event.data?.type === "theme") {
                    const newTheme = event.data.value;
                    const params = new URLSearchParams(window.location.search);
                    if (params.get("theme") !== newTheme) {
                        params.set("theme", newTheme);
                        const newUrl = `${window.location.pathname}?${params.toString()}`;
                        window.location.replace(newUrl);
                    }
                }
            });
            </script>
        </head>
        <body>
            <div id="dash-container">
                {%app_entry%}
            </div>
            <footer>
                {%config%}
                {%scripts%}
                {%renderer%}
            </footer>
        </body>
    </html>
    """


    return dash_app
