add_executable(shaderlint main.cpp)
target_link_libraries(shaderlint PRIVATE soupmix::core soupmix_warnings)
