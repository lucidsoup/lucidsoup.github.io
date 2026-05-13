#pragma once

namespace soupmix::render { class Texture; }

namespace soupmix::ui {

class PreviewUI {
public:
    // Renders a preview window showing the given final-output texture
    // scaled to fit. Pass nullptr to render an empty placeholder.
    void draw(const render::Texture* output);
};

} // namespace soupmix::ui
