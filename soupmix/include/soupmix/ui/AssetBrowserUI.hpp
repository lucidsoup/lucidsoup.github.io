#pragma once

namespace soupmix::project { class Project; }

namespace soupmix::ui {

class AssetBrowserUI {
public:
    void draw(project::Project* project);
};

} // namespace soupmix::ui
