include(GoogleTest)

add_executable(soupmix_tests
    graph/GraphCompileTests.cpp
    graph/GraphCycleTests.cpp
    graph/NodeRegistryTests.cpp
    project/ProjectLoadTests.cpp
    project/ProjectSaveTests.cpp
    mapping/SurfaceSerializationTests.cpp
)

target_link_libraries(soupmix_tests PRIVATE
    soupmix::core
    GTest::gtest_main
    soupmix_warnings
)

gtest_discover_tests(soupmix_tests)
