# All .cpp files contributing to soupmix_core. Sub-directory CMakeLists
# files append to soupmix_core via target_sources(... PRIVATE ...).
add_subdirectory(core)
add_subdirectory(platform)
add_subdirectory(render)
add_subdirectory(graph)
add_subdirectory(nodes)
add_subdirectory(mapping)
add_subdirectory(control)
add_subdirectory(project)
add_subdirectory(ui)
add_subdirectory(io)
add_subdirectory(debug)
add_subdirectory(app)
